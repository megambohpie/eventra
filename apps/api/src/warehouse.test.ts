import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { HandoverDocumentDto, OrderDto, PickListDto, ScanOutcomeDto } from '@eventra/shared';
import { createTestApp, db, loginAs, resetDb } from '../test/helpers';

const V1 = '/api/v1';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const errorCode = (res: request.Response) => (res.body as { error: { code: string } }).error.code;
const data = <T>(res: request.Response) => (res.body as { data: T }).data;

const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let seq = 0;
const token = (n: number) => `qr-${String(n).padStart(4, '0')}-xxxxxxxxxxxxxxxxxxxx`;

async function seedProduct(name: string, stock: number) {
  const category =
    (await db.category.findFirst({ where: { name: 'Umum' } })) ??
    (await db.category.create({ data: { name: 'Umum' } }));
  const product = await db.product.create({
    data: {
      name,
      categoryId: category.id,
      pricingUnit: 'PCS',
      unitLabel: 'pcs',
      price: 100000n,
      deposit: 0n,
    },
  });
  const assets = [];
  for (let i = 0; i < stock; i += 1) {
    seq += 1;
    assets.push(
      await db.asset.create({
        data: {
          code: `AST-W${String(seq).padStart(5, '0')}`,
          qrToken: token(seq),
          productId: product.id,
        },
      }),
    );
  }
  return { product, assets };
}

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

/** Pesanan lengkap hingga SCHEDULED (PIC lengkap) atau CONFIRMED bila `schedule` false. */
async function order(
  c: Ctx,
  items: { productId: string; quantity: number }[],
  start = '2027-03-08',
  end = '2027-03-09',
  schedule = true,
): Promise<OrderDto> {
  const post = (path: string, body: object = {}) =>
    request(c.app).post(`${V1}${path}`).set(auth(c.admin)).send(body);
  const created = await post('/orders', {
    customerId: c.customerId,
    startDate: start,
    endDate: end,
    eventLocation: 'Balai Kartini',
    items,
  });
  expect(created.status).toBe(201);
  const id = data<OrderDto>(created).id;
  const pics = [
    { role: 'CUSTOMER_PIC', source: 'CUSTOMER', name: 'Budi', phone: '0812' },
    { role: 'WAREHOUSE_OUT', source: 'OWNER', userId: c.warehouseUserId },
    { role: 'WAREHOUSE_IN', source: 'OWNER', userId: c.warehouseUserId },
    { role: 'FIELD', source: 'CUSTOMER', name: 'Sari', phone: '0813' },
  ];
  for (const pic of pics) expect((await post(`/orders/${id}/pics`, pic)).status).toBe(201);
  expect((await post(`/orders/${id}/submit`)).status).toBe(200);
  expect((await post(`/orders/${id}/quote`)).status).toBe(200);
  expect((await post(`/orders/${id}/confirm`)).status).toBe(200);
  if (schedule) expect((await post(`/orders/${id}/schedule`)).status).toBe(200);
  return data<OrderDto>(await request(c.app).get(`${V1}/orders/${id}`).set(auth(c.admin)));
}

const createPick = (c: Ctx, orderId: string) =>
  request(c.app).post(`${V1}/pick-lists`).set(auth(c.warehouse)).send({ orderId });
const scan = (c: Ctx, pickId: string, body: object, tok = c.warehouse) =>
  request(c.app).post(`${V1}/pick-lists/${pickId}/scan`).set(auth(tok)).send(body);
const getPick = async (c: Ctx, id: string) =>
  data<PickListDto>(await request(c.app).get(`${V1}/pick-lists/${id}`).set(auth(c.warehouse)));

async function dispatched(
  c: Ctx,
  productId: string,
  assets: { qrToken: string; code: string }[],
  qty: number,
) {
  const o = await order(c, [{ productId, quantity: qty }]);
  const pick = data<PickListDto>(await createPick(c, o.id));
  for (const a of assets.slice(0, qty)) {
    expect((await scan(c, pick.id, { action: 'PICK', qrToken: a.qrToken })).status).toBe(200);
  }
  for (const a of assets.slice(0, qty)) {
    expect((await scan(c, pick.id, { action: 'VERIFY', qrToken: a.qrToken })).status).toBe(200);
  }
  const out = await request(c.app)
    .post(`${V1}/pick-lists/${pick.id}/checkout`)
    .set(auth(c.warehouse))
    .send({});
  expect(out.status).toBe(200);
  return { order: o, pick: data<PickListDto>(out) };
}

describe('Fase 04 — gudang, scan, dokumen serah-terima', () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  it('RBAC: owner membaca, field PIC ditolak, gudang boleh menulis', async () => {
    const c = await setup();
    const { product } = await seedProduct('Speaker', 2);
    const o = await order(c, [{ productId: product.id, quantity: 1 }]);
    const owner = await loginAs(c.app, 'OWNER');
    const field = await loginAs(c.app, 'FIELD_PIC');

    expect((await request(c.app).get(`${V1}/pick-lists`).set(auth(owner))).status).toBe(200);
    expect((await request(c.app).get(`${V1}/pick-lists`).set(auth(field))).status).toBe(403);
    expect(
      (await request(c.app).post(`${V1}/pick-lists`).set(auth(field)).send({ orderId: o.id }))
        .status,
    ).toBe(403);
    expect((await createPick(c, o.id)).status).toBe(201);
    expect((await createPick(c, o.id)).status).toBe(409); // satu pick list aktif per pesanan
    expect((await request(c.app).get(`${V1}/pick-lists`)).status).toBe(401);
  });

  it('pick list hanya untuk pesanan terkonfirmasi dan memakai konversi paket', async () => {
    const c = await setup();
    const { product: panel } = await seedProduct('Panel', 8);
    const { product: led } = await seedProduct('LED 1m', 0);
    await db.productBundle.create({
      data: { productId: led.id, componentProductId: panel.id, quantity: 4 },
    });
    const draft = await request(c.app)
      .post(`${V1}/orders`)
      .set(auth(c.admin))
      .send({
        customerId: c.customerId,
        startDate: '2027-03-08',
        endDate: '2027-03-08',
        eventLocation: 'X',
        items: [{ productId: led.id, quantity: 2 }],
      });
    expect((await createPick(c, data<OrderDto>(draft).id)).status).toBe(409);

    const o = await order(
      c,
      [{ productId: led.id, quantity: 2 }],
      '2027-04-01',
      '2027-04-02',
      false,
    );
    const pick = data<PickListDto>(await createPick(c, o.id));
    expect(pick.number).toMatch(/^PKL-\d{4}-\d{6}$/);
    expect(pick.lines).toEqual([
      expect.objectContaining({ productId: panel.id, required: 8, picked: 0 }),
    ]);
  });

  it('scan salah atau kurang memblokir; hasil scan tercatat termasuk yang ditolak', async () => {
    const c = await setup();
    const { product, assets } = await seedProduct('Speaker', 3);
    const { assets: otherAssets } = await seedProduct('Kabel', 1);
    const [a1, a2, a3] = assets;
    if (!a1 || !a2 || !a3) throw new Error('seed');
    const damaged = await db.asset.create({
      data: {
        code: 'AST-DMG01',
        qrToken: token(900),
        productId: product.id,
        condition: 'DAMAGED',
      },
    });
    const o = await order(c, [{ productId: product.id, quantity: 2 }]);
    const pick = data<PickListDto>(await createPick(c, o.id));

    const unknown = await scan(c, pick.id, { action: 'PICK', qrToken: 'tidak-dikenal-123456789' });
    expect(unknown.status).toBe(404);
    expect(errorCode(unknown)).toBe('SCAN_UNKNOWN_QR');
    const wrongProduct = await scan(c, pick.id, {
      action: 'PICK',
      qrToken: otherAssets[0]?.qrToken,
    });
    expect(errorCode(wrongProduct)).toBe('SCAN_PRODUCT_NOT_REQUIRED');
    const dmg = await scan(c, pick.id, { action: 'PICK', qrToken: damaged.qrToken });
    expect(errorCode(dmg)).toBe('SCAN_ASSET_DAMAGED');
    // Verifikasi akhir wajib QR (bukan kode aset).
    expect((await scan(c, pick.id, { action: 'VERIFY', assetCode: a1.code })).status).toBe(400);

    // Pilih lewat QR dan lewat kode aset (manual).
    const p1 = await scan(c, pick.id, { action: 'PICK', qrToken: a1.qrToken });
    expect(p1.status).toBe(200);
    expect(data<ScanOutcomeDto>(p1).item.status).toBe('PICKED');
    expect((await scan(c, pick.id, { action: 'PICK', assetCode: a2.code })).status).toBe(200);
    expect(errorCode(await scan(c, pick.id, { action: 'PICK', qrToken: a3.qrToken }))).toBe(
      'SCAN_QUANTITY_FULL',
    );
    expect(errorCode(await scan(c, pick.id, { action: 'PICK', qrToken: a1.qrToken }))).toBe(
      'SCAN_ALREADY_PICKED',
    );
    expect((await db.asset.findUniqueOrThrow({ where: { id: a1.id } })).status).toBe('RESERVED');

    // Checkout sebelum verifikasi diblokir; aset di luar pick list ditolak saat verifikasi.
    const early = await request(c.app)
      .post(`${V1}/pick-lists/${pick.id}/checkout`)
      .set(auth(c.warehouse))
      .send({});
    expect(errorCode(early)).toBe('PICK_LIST_NOT_VERIFIED');
    expect(errorCode(await scan(c, pick.id, { action: 'VERIFY', qrToken: a3.qrToken }))).toBe(
      'SCAN_NOT_IN_PICK_LIST',
    );
    expect((await scan(c, pick.id, { action: 'VERIFY', qrToken: a1.qrToken })).status).toBe(200);
    expect(errorCode(await scan(c, pick.id, { action: 'VERIFY', qrToken: a1.qrToken }))).toBe(
      'SCAN_ALREADY_VERIFIED',
    );
    expect(
      errorCode(
        await request(c.app)
          .post(`${V1}/pick-lists/${pick.id}/checkout`)
          .set(auth(c.warehouse))
          .send({}),
      ),
    ).toBe('PICK_LIST_NOT_VERIFIED');
    const last = await scan(c, pick.id, { action: 'VERIFY', qrToken: a2.qrToken });
    expect(data<ScanOutcomeDto>(last).pickList.status).toBe('VERIFIED');

    // Setelah verifikasi, aset yang berubah rusak memblokir checkout.
    await db.asset.update({ where: { id: a2.id }, data: { condition: 'DAMAGED' } });
    const blocked = await request(c.app)
      .post(`${V1}/pick-lists/${pick.id}/checkout`)
      .set(auth(c.warehouse))
      .send({});
    expect(errorCode(blocked)).toBe('CHECKOUT_BLOCKED');
    await db.asset.update({ where: { id: a2.id }, data: { condition: 'GOOD' } });

    const log = await getPick(c, pick.id);
    const rejected = log.scans.filter((s) => s.result === 'REJECTED').map((s) => s.reason);
    expect(rejected).toEqual(
      expect.arrayContaining([
        'SCAN_PRODUCT_NOT_REQUIRED',
        'SCAN_ASSET_DAMAGED',
        'SCAN_QUANTITY_FULL',
        'SCAN_NOT_IN_PICK_LIST',
        'SCAN_ALREADY_VERIFIED',
      ]),
    );
    const audits = await db.auditLog.count({ where: { action: 'scan.rejected' } });
    expect(audits).toBeGreaterThanOrEqual(5);
  });

  it('aset yang salah dipilih dapat dilepas; pesanan batal melepas aset terpilih', async () => {
    const c = await setup();
    const { product, assets } = await seedProduct('Speaker', 2);
    const [a1, a2] = assets;
    if (!a1 || !a2) throw new Error('seed');
    const o = await order(c, [{ productId: product.id, quantity: 1 }]);
    const pick = data<PickListDto>(await createPick(c, o.id));
    const picked = data<ScanOutcomeDto>(
      await scan(c, pick.id, { action: 'PICK', qrToken: a1.qrToken }),
    );

    const removed = await request(c.app)
      .delete(`${V1}/pick-lists/${pick.id}/items/${picked.item.id}`)
      .set(auth(c.warehouse));
    expect(removed.status).toBe(200);
    expect((await db.asset.findUniqueOrThrow({ where: { id: a1.id } })).status).toBe('AVAILABLE');
    expect(await db.pickListItem.count({ where: { pickListId: pick.id } })).toBe(1); // riwayat tersimpan

    await scan(c, pick.id, { action: 'PICK', qrToken: a2.qrToken });
    const cancelled = await request(c.app)
      .post(`${V1}/orders/${o.id}/cancel`)
      .set(auth(c.admin))
      .send({});
    expect(cancelled.status).toBe(200);
    expect((await db.asset.findUniqueOrThrow({ where: { id: a2.id } })).status).toBe('AVAILABLE');
    expect((await getPick(c, pick.id)).status).toBe('CANCELLED');
  });

  it('dua pick list tidak dapat memegang aset yang sama secara bersamaan', async () => {
    const c = await setup();
    const { product, assets } = await seedProduct('Speaker', 2);
    const [a1] = assets;
    if (!a1) throw new Error('seed');
    const o1 = await order(c, [{ productId: product.id, quantity: 1 }], '2027-05-01', '2027-05-01');
    const o2 = await order(c, [{ productId: product.id, quantity: 1 }], '2027-05-01', '2027-05-01');
    const p1 = data<PickListDto>(await createPick(c, o1.id));
    const p2 = data<PickListDto>(await createPick(c, o2.id));

    const results = await Promise.all([
      scan(c, p1.id, { action: 'PICK', qrToken: a1.qrToken }),
      scan(c, p2.id, { action: 'PICK', qrToken: a1.qrToken }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const holders = await db.pickListItem.count({
      where: { assetId: a1.id, status: { in: ['PICKED', 'VERIFIED'] } },
    });
    expect(holders).toBe(1);
  });

  it('alur keluar → dokumen → tanda tangan → revisi (dokumen immutable)', async () => {
    const c = await setup();
    const { product, assets } = await seedProduct('Speaker', 2);
    const { order: o, pick } = await dispatched(c, product.id, assets, 2);

    expect(pick.status).toBe('DISPATCHED');
    expect(
      data<OrderDto>(await request(c.app).get(`${V1}/orders/${o.id}`).set(auth(c.admin))).status,
    ).toBe('IN_PROGRESS');
    for (const a of assets) {
      expect((await db.asset.findUniqueOrThrow({ where: { id: a.id } })).status).toBe(
        'CHECKED_OUT',
      );
    }
    const doc = pick.documents[0];
    if (!doc) throw new Error('dokumen keluar tidak ada');
    expect(doc.type).toBe('OUT');
    expect(doc.number).toMatch(/^SJ-\d{4}-\d{6}$/);
    expect(doc.payload.items.map((i) => i.assetCode).sort()).toEqual(
      assets.map((a) => a.code).sort(),
    );
    expect(doc.payload.items.every((i) => i.condition === 'GOOD' && i.scannedAt)).toBe(true);

    const pdf = await request(c.app)
      .get(`${V1}/handover-documents/${doc.id}/pdf`)
      .set(auth(c.warehouse))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (d: Buffer) => chunks.push(d));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const customerPic = o.pics.find((p) => p.role === 'CUSTOMER_PIC');
    const whPic = o.pics.find((p) => p.role === 'WAREHOUSE_OUT');
    const whInPic = o.pics.find((p) => p.role === 'WAREHOUSE_IN');
    if (!customerPic || !whPic || !whInPic) throw new Error('pic');
    const sign = (role: string, picId: string, tok = c.warehouse) =>
      request(c.app)
        .post(`${V1}/handover-documents/${doc.id}/sign`)
        .set(auth(tok))
        .send({ role, picId, image: PNG_1X1 });

    expect(errorCode(await sign('WAREHOUSE', customerPic.id))).toBe('SIGNER_INVALID');
    expect(errorCode(await sign('WAREHOUSE', whInPic.id))).toBe('SIGNER_INVALID'); // bukan gudang keluar
    const bad = await request(c.app)
      .post(`${V1}/handover-documents/${doc.id}/sign`)
      .set(auth(c.warehouse))
      .send({ role: 'WAREHOUSE', picId: whPic.id, image: 'data:image/png;base64,AAAA' });
    expect(errorCode(bad)).toBe('INVALID_IMAGE');
    expect((await sign('WAREHOUSE', whPic.id)).status).toBe(200);
    expect(errorCode(await sign('WAREHOUSE', whPic.id))).toBe('ALREADY_SIGNED');
    const signed = data<HandoverDocumentDto>(await sign('COUNTERPART', customerPic.id));
    expect(signed.fullySigned).toBe(true);
    expect(signed.signatures.map((s) => s.signerName).sort()).toEqual(['Budi', 'User WAREHOUSE']);

    // Dokumen bertanda tangan tidak dapat diubah/dihapus, bahkan lewat SQL langsung.
    await expect(
      db.handoverDocument.update({ where: { id: doc.id }, data: { number: 'SJ-X' } }),
    ).rejects.toThrow();
    await expect(db.handoverDocument.delete({ where: { id: doc.id } })).rejects.toThrow();
    await expect(
      db.documentSignature.deleteMany({ where: { documentId: doc.id } }),
    ).rejects.toThrow();

    // Revisi: versi baru dengan nomor sama; versi lama tetap utuh dan tidak bisa ditandatangani lagi.
    const revise = await request(c.app)
      .post(`${V1}/handover-documents/${doc.id}/revise`)
      .set(auth(c.warehouse))
      .send({ reason: 'Koreksi PIC penerima' });
    expect(revise.status).toBe(201);
    const v2 = data<HandoverDocumentDto>(revise);
    expect(v2.number).toBe(doc.number);
    expect(v2.version).toBe(2);
    expect(v2.signatures).toHaveLength(0);
    expect(v2.revisionReason).toBe('Koreksi PIC penerima');
    const v1 = data<HandoverDocumentDto>(
      await request(c.app).get(`${V1}/handover-documents/${doc.id}`).set(auth(c.warehouse)),
    );
    expect(v1.isLatest).toBe(false);
    expect(v1.signatures).toHaveLength(2);
    expect(errorCode(await sign('COUNTERPART', customerPic.id))).toBe('DOCUMENT_SUPERSEDED');
    const field = await request(c.app)
      .post(`${V1}/handover-documents/${doc.id}/revise`)
      .set(auth(c.warehouse))
      .send({ reason: 'Lagi' });
    expect(errorCode(field)).toBe('DOCUMENT_SUPERSEDED');

    // Scan event append-only.
    await expect(db.scanEvent.deleteMany({})).rejects.toThrow();
  });

  it('pengembalian: selisih, kondisi, foto, scan terlambat, dan berita acara', async () => {
    const c = await setup();
    const { product, assets } = await seedProduct('Speaker', 3);
    const [a1, a2] = assets;
    const spare = assets[2];
    if (!a1 || !a2 || !spare) throw new Error('seed');
    const { order: o, pick } = await dispatched(c, product.id, assets, 2);
    const ret = (body: object) =>
      request(c.app)
        .post(`${V1}/pick-lists/${pick.id}/return/scan`)
        .set(auth(c.warehouse))
        .send(body);
    const complete = (body: object = {}) =>
      request(c.app)
        .post(`${V1}/pick-lists/${pick.id}/return/complete`)
        .set(auth(c.warehouse))
        .send(body);

    expect(errorCode(await ret({ qrToken: 'tidak-dikenal-123456789', condition: 'GOOD' }))).toBe(
      'SCAN_UNKNOWN_QR',
    );
    // Aset di luar pengeluaran tidak boleh diterima kembali.
    expect(errorCode(await ret({ qrToken: spare.qrToken, condition: 'GOOD' }))).toBe(
      'SCAN_NOT_IN_PICK_LIST',
    );

    const r1 = await ret({ qrToken: a1.qrToken, condition: 'POOR', note: 'Lecet' });
    expect(r1.status).toBe(200);
    const item1 = data<ScanOutcomeDto>(r1).item;
    expect(item1).toMatchObject({
      status: 'RETURNED',
      returnCondition: 'POOR',
      returnNote: 'Lecet',
    });
    expect(errorCode(await ret({ qrToken: a1.qrToken, condition: 'GOOD' }))).toBe(
      'SCAN_ALREADY_RETURNED',
    );
    const back = await db.asset.findUniqueOrThrow({ where: { id: a1.id } });
    expect(back).toMatchObject({ status: 'AVAILABLE', condition: 'POOR' });

    // Foto: hanya JPEG/PNG valid, maksimal 5 per aset.
    const photo = (bytes: Buffer, type = 'image/jpeg') =>
      request(c.app)
        .post(`${V1}/pick-lists/${pick.id}/items/${item1.id}/photos`)
        .set(auth(c.warehouse))
        .set('Content-Type', type)
        .send(bytes);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
    expect(errorCode(await photo(Buffer.from('bukan gambar'), 'image/jpeg'))).toBe('INVALID_IMAGE');
    for (let i = 0; i < 5; i += 1) expect((await photo(jpeg)).status).toBe(201);
    expect(errorCode(await photo(jpeg))).toBe('PHOTO_LIMIT');
    const dto = await getPick(c, pick.id);
    const photoIds = dto.items.find((i) => i.id === item1.id)?.photoIds ?? [];
    expect(photoIds).toHaveLength(5);
    const image = await request(c.app)
      .get(`${V1}/pick-lists/${pick.id}/items/${item1.id}/photos/${photoIds[0]}`)
      .set(auth(c.warehouse));
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/jpeg');

    // Selesaikan dengan selisih: wajib konfirmasi eksplisit.
    expect(errorCode(await complete())).toBe('RETURN_INCOMPLETE');
    const issue = data<PickListDto>(
      await complete({ acceptMissing: true, note: 'a2 belum kembali' }),
    );
    expect(issue.status).toBe('RETURN_ISSUE');
    expect(issue.items.find((i) => i.assetCode === a2.code)?.status).toBe('MISSING');
    expect((await db.asset.findUniqueOrThrow({ where: { id: a2.id } })).status).toBe(
      'ISSUE_ON_SITE',
    );
    expect(
      data<OrderDto>(await request(c.app).get(`${V1}/orders/${o.id}`).set(auth(c.admin))).status,
    ).toBe('ISSUE');
    const returnDoc1 = issue.documents.find((d) => d.type === 'RETURN');
    expect(returnDoc1?.payload.summary).toEqual({ expected: 2, returned: 1, missing: 1 });
    expect(returnDoc1?.number).toMatch(/^BAR-\d{4}-\d{6}$/);
    // Aset hilang tidak boleh dialokasikan ke pick list lain.
    const o2 = await order(c, [{ productId: product.id, quantity: 1 }], '2027-06-01', '2027-06-01');
    const p2 = data<PickListDto>(await createPick(c, o2.id));
    expect(errorCode(await scan(c, p2.id, { action: 'PICK', qrToken: a2.qrToken }))).toBe(
      'SCAN_ASSET_UNAVAILABLE',
    );

    // Aset ditemukan terlambat dan rusak → karantina, berita acara direvisi, pesanan selesai.
    expect((await ret({ qrToken: a2.qrToken, condition: 'DAMAGED' })).status).toBe(200);
    expect((await db.asset.findUniqueOrThrow({ where: { id: a2.id } })).status).toBe('QUARANTINED');
    const done = data<PickListDto>(await complete());
    expect(done.status).toBe('RETURNED');
    const returnDocs = done.documents.filter((d) => d.type === 'RETURN');
    expect(returnDocs.map((d) => d.version)).toEqual([1, 2]);
    expect(returnDocs[1]?.number).toBe(returnDoc1?.number);
    expect(returnDocs[1]?.payload.summary).toEqual({ expected: 2, returned: 2, missing: 0 });
    expect(returnDocs[0]?.payload.summary.missing).toBe(1); // versi lama tidak berubah
    expect(
      data<OrderDto>(await request(c.app).get(`${V1}/orders/${o.id}`).set(auth(c.admin))).status,
    ).toBe('COMPLETED');

    // Semua aktivitas ada di audit log.
    for (const action of [
      'pick_list.create',
      'pick_list.pick',
      'pick_list.verify',
      'pick_list.checkout',
      'pick_list.return_scan',
      'pick_list.return_complete',
      'pick_list.photo',
    ]) {
      expect(await db.auditLog.count({ where: { action } }), action).toBeGreaterThan(0);
    }
  });

  it('checkout butuh pesanan SCHEDULED', async () => {
    const c = await setup();
    const { product, assets } = await seedProduct('Speaker', 1);
    const [a1] = assets;
    if (!a1) throw new Error('seed');
    const o = await order(
      c,
      [{ productId: product.id, quantity: 1 }],
      '2027-07-01',
      '2027-07-01',
      false,
    );
    const pick = data<PickListDto>(await createPick(c, o.id));
    await scan(c, pick.id, { action: 'PICK', qrToken: a1.qrToken });
    await scan(c, pick.id, { action: 'VERIFY', qrToken: a1.qrToken });
    const out = await request(c.app)
      .post(`${V1}/pick-lists/${pick.id}/checkout`)
      .set(auth(c.warehouse))
      .send({});
    expect(errorCode(out)).toBe('ORDER_NOT_SCHEDULED');
  });
});
