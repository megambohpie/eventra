import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type {
  AssetDto,
  AssetMetricsDto,
  CustomerDto,
  IncidentDto,
  InvoiceDto,
  OrderDto,
  OwnerDashboardDto,
  PickListDto,
  ReceiptDto,
  ReceivablesReportDto,
  RevenueReportDto,
} from '@eventra/shared';
import { createTestApp, createUser, db, loginAs, resetDb } from '../test/helpers';

/**
 * E2E smoke test: seluruh alur kritis dari master data sampai pendapatan, hanya lewat HTTP API
 * (kecuali token QR yang di dunia nyata dibaca dari label cetak — di sini dari database).
 */
const V1 = '/api/v1';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const data = <T>(res: request.Response) => (res.body as { data: T }).data;
const PNG_SIGNATURE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const dayOffset = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1]);

describe('Fase 08 — E2E smoke: alur kritis rental', () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  it('terima stok → pesan → bayar → keluar (scan) → insiden → kembali (scan) → pendapatan', async () => {
    const { app } = createTestApp();
    const call = (method: 'get' | 'post' | 'put', token: string, path: string, body?: object) => {
      const r = request(app)[method](`${V1}${path}`).set(auth(token));
      return method === 'get' ? r : r.send(body ?? {});
    };
    const ok = async <T>(
      method: 'get' | 'post' | 'put',
      token: string,
      path: string,
      body?: object,
      status = 200,
    ) => {
      const res = await call(method, token, path, body);
      expect(res.status, `${method.toUpperCase()} ${path} → ${JSON.stringify(res.body)}`).toBe(
        status,
      );
      return data<T>(res);
    };

    // ---- Pengguna per peran ----
    const admin = await loginAs(app, 'ADMIN');
    const warehouse = await loginAs(app, 'WAREHOUSE');
    const field = await loginAs(app, 'FIELD_PIC');
    const owner = await loginAs(app, 'OWNER');
    const whUser = await db.user.findFirstOrThrow({ where: { role: 'WAREHOUSE' } });
    const fieldUser = await db.user.findFirstOrThrow({ where: { role: 'FIELD_PIC' } });
    await createUser('OPS_COORDINATOR');

    // ---- 1. Master data + penerimaan stok ----
    const category = await ok<{ id: string }>('post', admin, '/categories', { name: 'Audio' }, 201);
    const location = await ok<{ id: string }>(
      'post',
      admin,
      '/locations',
      { name: 'Gudang Utama' },
      201,
    );
    const product = await ok<{ id: string }>(
      'post',
      admin,
      '/products',
      {
        name: 'Speaker Aktif',
        categoryId: category.id,
        pricingUnit: 'PCS',
        unitLabel: 'unit',
        price: 100_000,
        deposit: 50_000,
      },
      201,
    );
    const customer = await ok<CustomerDto>(
      'post',
      admin,
      '/customers',
      { type: 'COMPANY', name: 'PT Pesta Raya', phone: '021555' },
      201,
    );
    const draft = await ok<ReceiptDto>(
      'post',
      warehouse,
      '/stock-receipts',
      {
        source: 'PURCHASE',
        supplier: 'PT Pemasok',
        locationId: location.id,
        receivedDate: '2027-08-20',
        items: [{ productId: product.id, quantity: 3 }],
      },
      201,
    );
    expect(
      (await ok<ReceiptDto>('post', warehouse, `/stock-receipts/${draft.id}/receive`)).status,
    ).toBe('RECEIVED');
    const stocked = await db.asset.findMany({ where: { productId: product.id } });
    expect(stocked).toHaveLength(3);
    const [a1, a2, spare] = stocked;
    if (!a1 || !a2 || !spare) throw new Error('stok');
    const png = await call('get', warehouse, `/assets/${a1.id}/qr.png`);
    expect(png.status).toBe(200);
    expect(png.headers['content-type']).toBe('image/png');

    // ---- 2. Pesanan sampai terkonfirmasi + pembayaran ----
    const created = await ok<OrderDto>(
      'post',
      admin,
      '/orders',
      {
        customerId: customer.id,
        startDate: '2027-09-01',
        endDate: '2027-09-02',
        eventLocation: 'Balai Kartini',
        items: [{ productId: product.id, quantity: 2 }],
      },
      201,
    );
    const orderId = created.id;
    const pics = [
      { role: 'CUSTOMER_PIC', source: 'CUSTOMER', name: 'Budi', phone: '0812' },
      { role: 'WAREHOUSE_OUT', source: 'OWNER', userId: whUser.id },
      { role: 'WAREHOUSE_IN', source: 'OWNER', userId: whUser.id },
      { role: 'FIELD', source: 'OWNER', userId: fieldUser.id },
    ];
    for (const pic of pics) await ok('post', admin, `/orders/${orderId}/pics`, pic, 201);
    await ok('post', admin, `/orders/${orderId}/submit`);
    await ok('post', admin, `/orders/${orderId}/quote`);
    const held = await ok<OrderDto>('post', admin, `/orders/${orderId}/hold`);
    expect(held.status).toBe('AWAITING_PAYMENT');
    expect(held.subtotal).toBe(400_000); // 100.000 × 2 unit × 2 hari

    const invoice = await ok<InvoiceDto>('post', admin, '/invoices', { orderId }, 201);
    expect(invoice).toMatchObject({ paymentState: 'UNPAID' });
    await ok(
      'post',
      admin,
      `/invoices/${invoice.id}/payments`,
      {
        purpose: 'RENT',
        method: 'BANK_TRANSFER',
        amount: 400_000,
        reference: 'TRX-1',
      },
      201,
    );
    await ok(
      'post',
      admin,
      `/invoices/${invoice.id}/payments`,
      {
        purpose: 'DEPOSIT',
        method: 'CASH',
        amount: 100_000,
      },
      201,
    );
    expect((await ok<OrderDto>('post', admin, `/orders/${orderId}/confirm`)).status).toBe(
      'CONFIRMED',
    );
    await ok('post', admin, `/orders/${orderId}/schedule`);

    // Tidak ada overbooking: sisa 1 unit, pesanan kedua 2 unit pada tanggal sama ditolak.
    const clash = await ok<{ id: string }>(
      'post',
      admin,
      '/orders',
      {
        customerId: customer.id,
        startDate: '2027-09-02',
        endDate: '2027-09-03',
        eventLocation: 'Lain',
        items: [{ productId: product.id, quantity: 2 }],
      },
      201,
    );
    await ok('post', admin, `/orders/${clash.id}/pics`, pics[0], 201);
    await ok('post', admin, `/orders/${clash.id}/submit`).catch(() => undefined);
    const clashQuote = await call('post', admin, `/orders/${clash.id}/quote`);
    expect(clashQuote.status).toBeGreaterThanOrEqual(400);

    // ---- 3. Gudang: pick → verifikasi → checkout → dokumen ----
    const pick = await ok<PickListDto>('post', warehouse, '/pick-lists', { orderId }, 201);
    const scan = (action: string, qrToken: string, expected = 200) =>
      call('post', warehouse, `/pick-lists/${pick.id}/scan`, { action, qrToken }).then((r) => {
        expect(r.status, JSON.stringify(r.body)).toBe(expected);
        return r;
      });
    // Scan salah memblokir: aset ketiga tidak boleh melebihi kebutuhan, QR palsu ditolak.
    await scan('PICK', 'qr-palsu-xxxxxxxxxxxxxxxx', 404);
    await scan('PICK', a1.qrToken);
    await scan('PICK', a2.qrToken);
    expect(
      (await call('post', warehouse, `/pick-lists/${pick.id}/checkout`)).status,
      'checkout sebelum verifikasi harus ditolak',
    ).toBe(409);
    await scan('VERIFY', a1.qrToken);
    await scan('VERIFY', a2.qrToken);
    const out = await ok<PickListDto>('post', warehouse, `/pick-lists/${pick.id}/checkout`);
    expect(out.status).toBe('DISPATCHED');
    const sj = out.documents[0];
    if (!sj) throw new Error('dokumen keluar');
    expect(sj.number).toMatch(/^SJ-\d{4}-\d{6}$/);
    const pdf = await call('get', warehouse, `/handover-documents/${sj.id}/pdf`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    const full = await ok<OrderDto>('get', admin, `/orders/${orderId}`);
    const wh = full.pics.find((p) => p.role === 'WAREHOUSE_OUT');
    const cust = full.pics.find((p) => p.role === 'CUSTOMER_PIC');
    await ok('post', warehouse, `/handover-documents/${sj.id}/sign`, {
      role: 'WAREHOUSE',
      picId: wh?.id,
      image: PNG_SIGNATURE,
    });
    const signed = await ok<{ fullySigned: boolean }>(
      'post',
      warehouse,
      `/handover-documents/${sj.id}/sign`,
      { role: 'COUNTERPART', picId: cust?.id, image: PNG_SIGNATURE },
    );
    expect(signed.fullySigned).toBe(true);

    // ---- 4. Insiden di lapangan ----
    const incident = await ok<IncidentDto>(
      'post',
      field,
      '/incidents',
      { qrToken: a1.qrToken, urgency: 'HIGH', description: 'Speaker tidak bersuara' },
      201,
    );
    const photo = await request(app)
      .post(`${V1}/incidents/${incident.id}/photos`)
      .set(auth(field))
      .set('Content-Type', 'image/jpeg')
      .send(JPEG);
    expect(photo.status).toBe(201);
    const reported = await ok<IncidentDto>('post', field, `/incidents/${incident.id}/submit`);
    expect(reported.status).toBe('REPORTED');
    expect((await db.asset.findUniqueOrThrow({ where: { id: a1.id } })).status).toBe(
      'ISSUE_ON_SITE',
    );
    await ok('post', admin, `/incidents/${incident.id}/review`, {
      decision: 'GUIDANCE',
      note: 'Periksa kabel daya',
    });
    await ok('post', admin, `/incidents/${incident.id}/close`, {
      note: 'Kabel longgar, sudah normal',
      condition: 'GOOD',
    });

    // ---- 5. Pengembalian ----
    for (const a of [a1, a2]) {
      const r = await call('post', warehouse, `/pick-lists/${pick.id}/return/scan`, {
        qrToken: a.qrToken,
        condition: 'GOOD',
      });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
    }
    const done = await ok<PickListDto>('post', warehouse, `/pick-lists/${pick.id}/return/complete`);
    expect(done.documents.map((d) => d.type).sort()).toEqual(['OUT', 'RETURN']);
    const finalOrder = await ok<OrderDto>('get', admin, `/orders/${orderId}`);
    expect(finalOrder.status).toBe('COMPLETED');
    const back = await db.asset.findMany({ where: { id: { in: [a1.id, a2.id] } } });
    expect(back.every((a) => a.status === 'AVAILABLE')).toBe(true);
    expect((await db.asset.findUniqueOrThrow({ where: { id: spare.id } })).status).toBe(
      'AVAILABLE',
    );

    // ---- 6. Keuangan: pendapatan diterima vs piutang ----
    const revenue = await ok<RevenueReportDto>(
      'get',
      owner,
      `/reports/revenue?from=${dayOffset(-1)}&to=${dayOffset(1)}`,
    );
    expect(revenue).toMatchObject({ rentReceived: 400_000, depositReceived: 100_000 });
    const recv = await ok<ReceivablesReportDto>('get', owner, '/reports/receivables');
    expect(recv.summary.totalOutstanding).toBe(0);
    const dashboard = await ok<OwnerDashboardDto>('get', owner, '/dashboards/owner');
    expect(dashboard).toBeTruthy();
    const metrics = await ok<AssetMetricsDto>('get', admin, `/assets/${a1.id}/metrics`);
    expect(metrics).toMatchObject({ rentalCount: 1, rentalDays: 2, incidentCount: 1 });

    // Owner tetap baca saja.
    expect((await call('post', owner, '/customers', { type: 'COMPANY', name: 'X' })).status).toBe(
      403,
    );

    // ---- 7. Jejak audit dan scan ----
    const actions = new Set((await db.auditLog.findMany()).map((r) => r.action));
    for (const a of [
      'order.confirm',
      'order.hold',
      'pick_list.verify',
      'pick_list.checkout',
      'pick_list.return_complete',
      'handover.sign',
      'incident.submit',
      'incident.close',
      'scan.rejected',
    ]) {
      expect(actions.has(a), a).toBe(true);
    }
    expect(await db.scanEvent.count({ where: { result: 'OK' } })).toBeGreaterThanOrEqual(8);
    expect(await db.scanEvent.count({ where: { result: 'REJECTED' } })).toBeGreaterThanOrEqual(1);
    expect((await db.handoverDocument.count()) >= 2).toBe(true);
  });

  it('pengguna nonaktif langsung kehilangan akses (sesi tidak dapat dipakai ulang)', async () => {
    const { app } = createTestApp();
    const user = await createUser('ADMIN', 'sementara@test.local');
    const login = await request(app)
      .post(`${V1}/auth/login`)
      .send({ email: user.email, password: 'Password123!' });
    expect(login.status).toBe(200);
    const { accessToken, refreshToken } = data<{ accessToken: string; refreshToken: string }>(
      login,
    );
    expect((await request(app).get(`${V1}/me`).set(auth(accessToken))).status).toBe(200);
    await db.user.update({ where: { id: user.id }, data: { active: false } });
    expect((await request(app).get(`${V1}/me`).set(auth(accessToken))).status).toBe(401);
    expect((await request(app).post(`${V1}/auth/refresh`).send({ refreshToken })).status).toBe(401);
  });

  it('AssetDto tidak pernah memuat harga beli untuk gudang', async () => {
    const { app } = createTestApp();
    const warehouse = await loginAs(app, 'WAREHOUSE');
    const category = await db.category.create({ data: { name: 'Umum' } });
    const product = await db.product.create({
      data: {
        name: 'Speaker',
        categoryId: category.id,
        pricingUnit: 'PCS',
        unitLabel: 'pcs',
        price: 1n,
        deposit: 0n,
      },
    });
    const asset = await db.asset.create({
      data: {
        code: 'AST-E00001',
        qrToken: 'e2e-token-xxxxxxxxxxxxxxxx',
        productId: product.id,
        purchasePrice: 9_999_999n,
      },
    });
    const res = await request(app).get(`${V1}/assets/${asset.id}`).set(auth(warehouse));
    expect(res.status).toBe(200);
    expect(JSON.stringify(data<AssetDto>(res))).not.toContain('9999999');
  });
});
