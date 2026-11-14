import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type {
  AvailabilityResultDto,
  HandoverDocumentDto,
  OrderDto,
  PickListDto,
  ProductDto,
} from '@eventra/shared';
import { createTestApp, db, loginAs, resetDb } from '../test/helpers';

const V1 = '/api/v1';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const errorCode = (res: request.Response) => (res.body as { error: { code: string } }).error.code;
const data = <T>(res: request.Response) => (res.body as { data: T }).data;

let seq = 0;
const qr = (n: number) => `qr-unl-${String(n).padStart(4, '0')}-xxxxxxxxxxxxxxxx`;

interface Ctx {
  app: Express;
  admin: string;
  warehouse: string;
  customerId: string;
  warehouseUserId: string;
}

async function setup(): Promise<Ctx> {
  const { app } = createTestApp();
  const admin = await loginAs(app, 'ADMIN');
  const warehouse = await loginAs(app, 'WAREHOUSE');
  const wh = await db.user.findFirstOrThrow({ where: { role: 'WAREHOUSE' } });
  const customer = await db.customer.create({
    data: { type: 'COMPANY', name: 'PT Acara', phone: '021' },
  });
  return { app, admin, warehouse, customerId: customer.id, warehouseUserId: wh.id };
}

async function product(c: Ctx, name: string, stockMode?: 'UNLIMITED') {
  const category =
    (await db.category.findFirst({ where: { name: 'Umum' } })) ??
    (await db.category.create({ data: { name: 'Umum' } }));
  const res = await request(c.app)
    .post(`${V1}/products`)
    .set(auth(c.admin))
    .send({
      name,
      categoryId: category.id,
      pricingUnit: 'PCS',
      unitLabel: 'pcs',
      price: 100000,
      deposit: 0,
      ...(stockMode ? { stockMode } : {}),
    });
  expect(res.status).toBe(201);
  return data<ProductDto>(res);
}

async function assets(productId: string, count: number) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    seq += 1;
    rows.push(
      await db.asset.create({
        data: { code: `AST-U${String(seq).padStart(5, '0')}`, qrToken: qr(seq), productId },
      }),
    );
  }
  return rows;
}

/** Pesanan terkonfirmasi (CONFIRMED) dengan PIC gudang dan penyewa. */
async function order(c: Ctx, items: { productId: string; quantity: number }[]) {
  const post = (path: string, body: object = {}) =>
    request(c.app).post(`${V1}${path}`).set(auth(c.admin)).send(body);
  const created = await post('/orders', {
    customerId: c.customerId,
    startDate: '2027-03-08',
    endDate: '2027-03-09',
    eventLocation: 'Balai Kartini',
    items,
  });
  expect(created.status).toBe(201);
  const id = data<OrderDto>(created).id;
  const pics = [
    { role: 'CUSTOMER_PIC', source: 'CUSTOMER', name: 'Budi', phone: '0812' },
    { role: 'WAREHOUSE_OUT', source: 'OWNER', userId: c.warehouseUserId },
    { role: 'WAREHOUSE_IN', source: 'OWNER', userId: c.warehouseUserId },
  ];
  for (const pic of pics) expect((await post(`/orders/${id}/pics`, pic)).status).toBe(201);
  expect((await post(`/orders/${id}/submit`)).status).toBe(200);
  expect((await post(`/orders/${id}/confirm`)).status).toBe(200);
  return data<OrderDto>(await request(c.app).get(`${V1}/orders/${id}`).set(auth(c.admin)));
}

const bundle = (c: Ctx, productId: string, components: [string, number][]) =>
  request(c.app)
    .put(`${V1}/product-bundles/${productId}`)
    .set(auth(c.admin))
    .send({
      components: components.map(([componentProductId, quantity]) => ({
        componentProductId,
        quantity,
      })),
    });

const check = (c: Ctx, items: { productId: string; quantity: number }[]) =>
  request(c.app)
    .post(`${V1}/availability/check`)
    .set(auth(c.admin))
    .send({ startDate: '2027-03-08', endDate: '2027-03-09', items });

describe('Barang stok tidak terbatas (mis. kabel jumper) sebagai komponen paket', () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  it('tanpa aset/QR: pembuatan aset dan penerimaan ditolak; produk beraset tak bisa diubah', async () => {
    const c = await setup();
    const cable = await product(c, 'Kabel jumper 1 m', 'UNLIMITED');
    expect(cable.stockMode).toBe('UNLIMITED');
    const location = await db.location.create({ data: { name: 'Gudang' } });

    const asset = await request(c.app)
      .post(`${V1}/assets`)
      .set(auth(c.admin))
      .send({ productId: cable.id });
    expect(asset.status).toBe(409);
    expect(errorCode(asset)).toBe('PRODUCT_UNLIMITED');

    const receipt = await request(c.app)
      .post(`${V1}/stock-receipts`)
      .set(auth(c.admin))
      .send({
        source: 'PURCHASE',
        locationId: location.id,
        receivedDate: '2026-11-10',
        items: [{ productId: cable.id, quantity: 3 }],
      });
    expect(receipt.status).toBe(409);
    expect(errorCode(receipt)).toBe('PRODUCT_UNLIMITED');

    const panel = await product(c, 'Panel LED');
    await assets(panel.id, 1);
    const switched = await request(c.app)
      .put(`${V1}/products/${panel.id}`)
      .set(auth(c.admin))
      .send({
        name: panel.name,
        categoryId: panel.categoryId,
        pricingUnit: 'PCS',
        unitLabel: 'pcs',
        price: 100000,
        deposit: 0,
        stockMode: 'UNLIMITED',
      });
    expect(switched.status).toBe(409);
    expect(errorCode(switched)).toBe('PRODUCT_HAS_ASSETS');
  });

  it('ketersediaan: stok tak terbatas tidak pernah membatasi; paket dibatasi komponen berQR', async () => {
    const c = await setup();
    const panel = await product(c, 'Panel LED');
    const cable = await product(c, 'Kabel jumper 1 m', 'UNLIMITED');
    const videotron = await product(c, 'Videotron 1 meter');
    await assets(panel.id, 4);
    expect(
      (
        await bundle(c, videotron.id, [
          [panel.id, 2],
          [cable.id, 3],
        ])
      ).status,
    ).toBe(200);

    // Kabel sendiri: tanpa aset sama sekali, 5000 pcs tetap tersedia.
    const cableOnly = data<AvailabilityResultDto>(
      await check(c, [{ productId: cable.id, quantity: 5000 }]),
    );
    expect(cableOnly.ok).toBe(true);
    expect(cableOnly.items[0]?.components[0]?.unlimited).toBe(true);

    // Paket: 4 panel / 2 per meter = maksimal 2; kabel tidak menjadi pembatas.
    const pkg = data<AvailabilityResultDto>(
      await check(c, [{ productId: videotron.id, quantity: 3 }]),
    );
    expect(pkg.ok).toBe(false);
    expect(pkg.items[0]?.maxQuantity).toBe(2);

    // Konfirmasi hanya mengalokasikan panel; kabel tidak punya alokasi stok.
    const o = await order(c, [{ productId: videotron.id, quantity: 2 }]);
    const allocated = await db.stockAllocation.findMany({ where: { orderId: o.id } });
    expect(new Set(allocated.map((a) => a.productId))).toEqual(new Set([panel.id]));
    expect(o.items[0]?.components.map((x) => [x.productName, x.required])).toEqual(
      expect.arrayContaining([
        ['Panel LED', 4],
        ['Kabel jumper 1 m', 6],
      ]),
    );
  });

  it('gudang: kabel dibuktikan dengan hitung jumlah; checkout diblok sampai cukup; selisih kembali hanya dicatat', async () => {
    const c = await setup();
    const panel = await product(c, 'Panel LED');
    const cable = await product(c, 'Kabel jumper 1 m', 'UNLIMITED');
    const videotron = await product(c, 'Videotron 1 meter');
    const panels = await assets(panel.id, 2);
    expect(
      (
        await bundle(c, videotron.id, [
          [panel.id, 2],
          [cable.id, 3],
        ])
      ).status,
    ).toBe(200);
    const o = await order(c, [{ productId: videotron.id, quantity: 1 }]);

    const post = (path: string, body: object = {}, token = c.warehouse) =>
      request(c.app).post(`${V1}${path}`).set(auth(token)).send(body);
    const pick = data<PickListDto>(await post('/pick-lists', { orderId: o.id }));
    const cableLine = pick.lines.find((l) => l.productId === cable.id);
    expect(cableLine).toMatchObject({ unlimited: true, required: 3, packed: null });
    expect(pick.lines.find((l) => l.productId === panel.id)?.unlimited).toBe(false);

    for (const a of panels) {
      expect(
        (await post(`/pick-lists/${pick.id}/scan`, { action: 'PICK', qrToken: a.qrToken })).status,
      ).toBe(200);
    }
    for (const a of panels) {
      expect(
        (await post(`/pick-lists/${pick.id}/scan`, { action: 'VERIFY', qrToken: a.qrToken }))
          .status,
      ).toBe(200);
    }
    const statusOf = async () =>
      data<PickListDto>(
        await request(c.app).get(`${V1}/pick-lists/${pick.id}`).set(auth(c.warehouse)),
      ).status;
    // Semua panel terverifikasi, tetapi kabel belum dihitung → belum siap keluar.
    expect(await statusOf()).toBe('OPEN');
    const early = await post(`/pick-lists/${pick.id}/checkout`);
    expect(early.status).toBe(409);
    expect(errorCode(early)).toBe('PICK_LIST_NOT_VERIFIED');

    const count = (
      action: 'OUT' | 'RETURN',
      productId: string,
      quantity: number,
      token = c.warehouse,
    ) => post(`/pick-lists/${pick.id}/count`, { action, productId, quantity }, token);

    // Validasi: barang berQR tak bisa dihitung; produk asing 404; tanpa izin 403.
    expect(errorCode(await count('OUT', panel.id, 2))).toBe('COUNT_NOT_APPLICABLE');
    expect((await count('OUT', videotron.id, 1)).status).toBe(404);
    const field = await loginAs(c.app, 'FIELD_PIC');
    expect((await count('OUT', cable.id, 3, field)).status).toBe(403);

    // Kurang dari kebutuhan: tercatat, tetapi belum siap keluar.
    expect((await count('OUT', cable.id, 2)).status).toBe(200);
    expect(await statusOf()).toBe('OPEN');
    // Cukup (lebih boleh: kabel cadangan) → pick list siap keluar.
    expect((await count('OUT', cable.id, 4)).status).toBe(200);
    expect(await statusOf()).toBe('VERIFIED');
    // Dikurangi lagi → kembali OPEN.
    expect((await count('OUT', cable.id, 1)).status).toBe(200);
    expect(await statusOf()).toBe('OPEN');
    expect((await count('OUT', cable.id, 4)).status).toBe(200);
    expect(await statusOf()).toBe('VERIFIED');

    const out = await post(`/pick-lists/${pick.id}/checkout`);
    expect(out.status).toBe(200);
    const dispatched = data<PickListDto>(out);
    expect(dispatched.lines.find((l) => l.productId === cable.id)?.packed).toBe(4);
    // Bukti keluar: event hitung + event checkout per baris tercatat.
    const events = dispatched.scans.filter((s) => s.productName === 'Kabel jumper 1 m');
    expect(
      events
        .filter((s) => s.action === 'COUNT_OUT')
        .map((s) => s.quantity)
        .sort(),
    ).toEqual([1, 2, 4, 4]);
    expect(events.find((s) => s.action === 'CHECKOUT')?.quantity).toBe(4);
    const outDoc = dispatched.documents.find((d) => d.type === 'OUT') as HandoverDocumentDto;
    expect(outDoc.payload.countedLines).toEqual([
      { productName: 'Kabel jumper 1 m', required: 3, packed: 4, returned: null, lost: null },
    ]);

    // Hitungan keluar tidak boleh diubah setelah barang keluar.
    expect(errorCode(await count('OUT', cable.id, 5))).toBe('PICK_LIST_CLOSED');

    // Kembali: panel discan, kabel wajib dihitung (0 pun boleh) sebelum selesai.
    for (const a of panels) {
      expect(
        (
          await post(`/pick-lists/${pick.id}/return/scan`, {
            qrToken: a.qrToken,
            condition: 'GOOD',
          })
        ).status,
      ).toBe(200);
    }
    const blocked = await post(`/pick-lists/${pick.id}/return/complete`);
    expect(blocked.status).toBe(409);
    expect(errorCode(blocked)).toBe('RETURN_COUNT_REQUIRED');
    expect(errorCode(await count('RETURN', cable.id, 5))).toBe('COUNT_EXCEEDS_PACKED');
    expect((await count('RETURN', cable.id, 3)).status).toBe(200);

    // Selisih 1 kabel hanya dicatat: pesanan tetap COMPLETED, bukan ISSUE.
    const done = await post(`/pick-lists/${pick.id}/return/complete`);
    expect(done.status).toBe(200);
    const finished = data<PickListDto>(done);
    expect(finished.status).toBe('RETURNED');
    const barDoc = finished.documents.find((d) => d.type === 'RETURN') as HandoverDocumentDto;
    expect(barDoc.payload.countedLines).toEqual([
      { productName: 'Kabel jumper 1 m', required: 3, packed: 4, returned: 3, lost: 1 },
    ]);
    const finalOrder = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(finalOrder.status).toBe('COMPLETED');
    const history = await db.orderStatusEvent.findFirstOrThrow({
      where: { orderId: o.id, toStatus: 'COMPLETED' },
    });
    expect(history.note).toContain('Kabel jumper 1 m −1');
  });

  it('pick list hanya berisi barang tak terbatas: siap keluar setelah dihitung', async () => {
    const c = await setup();
    const cable = await product(c, 'Kabel jumper 1 m', 'UNLIMITED');
    const o = await order(c, [{ productId: cable.id, quantity: 10 }]);
    const post = (path: string, body: object = {}) =>
      request(c.app).post(`${V1}${path}`).set(auth(c.warehouse)).send(body);
    const pick = data<PickListDto>(await post('/pick-lists', { orderId: o.id }));
    expect(pick.status).toBe('OPEN');
    expect((await post(`/pick-lists/${pick.id}/checkout`)).status).toBe(409);
    const counted = await post(`/pick-lists/${pick.id}/count`, {
      action: 'OUT',
      productId: cable.id,
      quantity: 10,
    });
    expect(data<PickListDto>(counted).status).toBe('VERIFIED');
    expect(data<PickListDto>(counted)).toMatchObject({ required: 10, picked: 10, verified: 10 });
    expect((await post(`/pick-lists/${pick.id}/checkout`)).status).toBe(200);
  });
});
