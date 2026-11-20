import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type {
  IncidentDto,
  NotificationListDto,
  OrderDto,
  PortalOrderDto,
  PickListDto,
  ReplacementTaskDto,
  ServiceTicketDto,
} from '@eventra/shared';
import { PASSWORD, createTestApp, createUser, db, loginAs, resetDb } from '../test/helpers';

const V1 = '/api/v1';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const errorCode = (res: request.Response) => (res.body as { error: { code: string } }).error.code;
const data = <T>(res: request.Response) => (res.body as { data: T }).data;

const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1]);

let seq = 0;
const qr = (n: number) => `qri-${String(n).padStart(4, '0')}-xxxxxxxxxxxxxxxxxxxx`;

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
          code: `AST-I${String(seq).padStart(5, '0')}`,
          qrToken: qr(seq),
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
  field: string;
  fieldUserId: string;
  customerId: string;
  warehouseUserId: string;
}

async function setup(): Promise<Ctx> {
  const { app } = createTestApp();
  const admin = await loginAs(app, 'ADMIN');
  const warehouse = await loginAs(app, 'WAREHOUSE');
  const field = await loginAs(app, 'FIELD_PIC');
  const wh = await db.user.findFirstOrThrow({ where: { role: 'WAREHOUSE' } });
  const fu = await db.user.findFirstOrThrow({ where: { role: 'FIELD_PIC' } });
  const customer = await db.customer.create({
    data: { type: 'COMPANY', name: 'PT Acara', phone: '0812-3456-7890' },
  });
  return {
    app,
    admin,
    warehouse,
    field,
    fieldUserId: fu.id,
    customerId: customer.id,
    warehouseUserId: wh.id,
  };
}

const post = (c: Ctx, token: string, path: string, body: object = {}) =>
  request(c.app).post(`${V1}${path}`).set(auth(token)).send(body);
const get = (c: Ctx, token: string, path: string) =>
  request(c.app).get(`${V1}${path}`).set(auth(token));

/** Pesanan SCHEDULED dengan PIC lapangan = pengguna FIELD_PIC uji, lalu barang keluar gudang. */
/** Nomor pesanan terakhir yang dikeluarkan `dispatched`; wajib disertakan pada laporan insiden. */
let orderNo = '';

async function dispatched(c: Ctx, productId: string, assets: { qrToken: string }[], qty: number) {
  const created = await post(c, c.admin, '/orders', {
    customerId: c.customerId,
    startDate: '2027-05-08',
    endDate: '2027-05-09',
    eventLocation: 'Balai Kartini',
    items: [{ productId, quantity: qty }],
  });
  expect(created.status).toBe(201);
  const id = data<OrderDto>(created).id;
  orderNo = data<OrderDto>(created).number;
  const pics = [
    { role: 'CUSTOMER_PIC', source: 'CUSTOMER', name: 'Budi', phone: '0812' },
    { role: 'WAREHOUSE_OUT', source: 'OWNER', userId: c.warehouseUserId },
    { role: 'WAREHOUSE_IN', source: 'OWNER', userId: c.warehouseUserId },
    { role: 'FIELD', source: 'OWNER', userId: c.fieldUserId },
  ];
  for (const pic of pics)
    expect((await post(c, c.admin, `/orders/${id}/pics`, pic)).status).toBe(201);
  for (const step of ['submit', 'quote', 'confirm', 'schedule']) {
    expect((await post(c, c.admin, `/orders/${id}/${step}`)).status).toBe(200);
  }
  const pick = data<PickListDto>(await post(c, c.warehouse, '/pick-lists', { orderId: id }));
  for (const action of ['PICK', 'VERIFY']) {
    for (const a of assets.slice(0, qty)) {
      const res = await post(c, c.warehouse, `/pick-lists/${pick.id}/scan`, {
        action,
        qrToken: a.qrToken,
      });
      expect(res.status).toBe(200);
    }
  }
  expect((await post(c, c.warehouse, `/pick-lists/${pick.id}/checkout`)).status).toBe(200);
  return { orderId: id, pickId: pick.id };
}

/** Buat draft → unggah foto → kirim sebagai PIC lapangan. */
const KINDS = ['ITEM', 'DAMAGE', 'STICKER'] as const;

async function report(c: Ctx, qrToken: string, photos = 3, token = c.field) {
  const draft = await post(c, token, '/incidents', {
    orderNumber: orderNo,
    qrToken,
    urgency: 'HIGH',
    description: 'Panel LED pecah di sudut kiri',
    locationNote: 'Panggung utama',
  });
  expect(draft.status).toBe(201);
  const id = data<IncidentDto>(draft).id;
  for (let i = 0; i < photos; i += 1) {
    const up = await request(c.app)
      .post(`${V1}/incidents/${id}/photos`)
      .query({ kind: KINDS[i % KINDS.length] })
      .set(auth(token))
      .set('Content-Type', 'image/jpeg')
      .send(JPEG);
    expect(up.status).toBe(201);
  }
  return id;
}

describe('Fase 05 — insiden, servis, aset pengganti', () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  it('RBAC: owner membaca, gudang tidak melapor, PIC lapangan hanya yang ditugaskan', async () => {
    const c = await setup();
    const { product, assets } = await seedProduct('Panel', 3);
    await dispatched(c, product.id, assets, 1);
    const owner = await loginAs(c.app, 'OWNER');
    const otherUser = await createUser('FIELD_PIC', 'field2@test.local');
    const login = await request(c.app)
      .post(`${V1}/auth/login`)
      .send({ email: otherUser.email, password: PASSWORD });
    const otherField = data<{ accessToken: string }>(login).accessToken;
    const [a1] = assets;
    if (!a1) throw new Error('seed');
    // Pilihan nomor pesanan: PIC yang ditugaskan melihat pesanan aktif, PIC lain tidak.
    const mine = data<{ number: string; assets: { code: string }[] }[]>(
      await get(c, c.field, '/incidents/reportable-orders'),
    );
    expect(mine.map((o) => o.number)).toEqual([orderNo]);
    expect(mine[0]?.assets.map((x) => x.code)).toEqual([assets[0]?.code]);
    expect(data<unknown[]>(await get(c, otherField, '/incidents/reportable-orders'))).toEqual([]);
    // QR surat jalan: token dokumen membuka daftar aset pada surat jalan itu.
    const sj = await db.handoverDocument.findFirstOrThrow({ where: { type: 'OUT' } });
    const scanned = await get(c, c.field, `/incidents/delivery-note/${sj.reportToken}`);
    expect(scanned.status).toBe(200);
    expect(data<{ orderNumber: string; assets: { code: string }[] }>(scanned)).toMatchObject({
      orderNumber: orderNo,
      assets: [{ code: a1.code }],
    });
    expect((await get(c, otherField, `/incidents/delivery-note/${sj.reportToken}`)).status).toBe(
      403,
    );
    expect((await get(c, c.warehouse, `/incidents/delivery-note/${sj.reportToken}`)).status).toBe(
      403,
    );
    expect((await get(c, c.field, '/incidents/delivery-note/token-tidak-ada')).status).toBe(404);
    // Nomor pesanan yang salah ditolak.
    const mismatch = await post(c, c.field, '/incidents', {
      orderNumber: 'ORD-SALAH',
      qrToken: a1.qrToken,
      urgency: 'LOW',
      description: 'rusak parah',
    });
    expect(mismatch.status).toBe(409);
    expect(errorCode(mismatch)).toBe('ORDER_MISMATCH');

    expect((await get(c, owner, '/incidents')).status).toBe(200);
    expect((await get(c, owner, '/service-tickets')).status).toBe(200);
    expect(
      (
        await post(c, c.warehouse, '/incidents', {
          orderNumber: orderNo,
          qrToken: a1.qrToken,
          urgency: 'LOW',
          description: 'rusak parah',
        })
      ).status,
    ).toBe(403);
    expect((await get(c, c.field, '/pick-lists')).status).toBe(403);
    expect((await get(c, c.field, '/service-tickets')).status).toBe(403);
    expect((await get(c, c.field, '/incidents')).status).toBe(200);

    // PIC lapangan lain (tidak ditugaskan pada pesanan ini) ditolak dan percobaannya tercatat.
    const rejected = await post(c, otherField, '/incidents', {
      orderNumber: orderNo,
      qrToken: a1.qrToken,
      urgency: 'LOW',
      description: 'rusak parah',
    });
    expect(rejected.status).toBe(403);
    expect(errorCode(rejected)).toBe('NOT_ASSIGNED');
    // Dua penolakan tercatat: nomor pesanan salah dan PIC tidak ditugaskan.
    expect(
      await db.scanEvent.count({ where: { action: 'INCIDENT_SCAN', result: 'REJECTED' } }),
    ).toBe(2);
    expect((await request(c.app).get(`${V1}/incidents`)).status).toBe(401);
  });

  it('laporan wajib 1–5 foto yang valid; aset baru ditandai setelah dikirim', async () => {
    const c = await setup();
    const { product, assets } = await seedProduct('Panel', 2);
    await dispatched(c, product.id, assets, 1);
    const [a1, a2] = assets;
    if (!a1 || !a2) throw new Error('seed');

    // Aset yang tidak sedang di luar gudang tidak dapat dilaporkan.
    const wrong = await post(c, c.field, '/incidents', {
      orderNumber: orderNo,
      qrToken: a2.qrToken,
      urgency: 'LOW',
      description: 'rusak parah',
    });
    expect(wrong.status).toBe(409);
    expect(errorCode(wrong)).toBe('SCAN_WRONG_STATE');
    const unknown = await post(c, c.field, '/incidents', {
      orderNumber: orderNo,
      qrToken: 'tidak-dikenal-xxxxxxxxxxxxx',
      urgency: 'LOW',
      description: 'rusak parah',
    });
    expect(unknown.status).toBe(404);

    const id = await report(c, a1.qrToken, 0);
    const submit = () => post(c, c.field, `/incidents/${id}/submit`);
    const none = await submit();
    expect(none.status).toBe(422);
    expect(errorCode(none)).toBe('PHOTOS_REQUIRED');
    expect((await db.asset.findUniqueOrThrow({ where: { id: a1.id } })).status).toBe('CHECKED_OUT');

    const upload = (body: Buffer, type = 'image/jpeg', kind = 'ITEM') =>
      request(c.app)
        .post(`${V1}/incidents/${id}/photos`)
        .query({ kind })
        .set(auth(c.field))
        .set('Content-Type', type)
        .send(body);
    expect(errorCode(await upload(Buffer.from('bukan gambar sama sekali')))).toBe('INVALID_IMAGE');
    // Jenis foto wajib; tanpa kind ditolak.
    expect(
      (
        await request(c.app)
          .post(`${V1}/incidents/${id}/photos`)
          .set(auth(c.field))
          .set('Content-Type', 'image/jpeg')
          .send(JPEG)
      ).status,
    ).toBe(400);
    // Foto barang + kerusakan saja belum cukup: foto stiker aset wajib.
    expect((await upload(JPEG, 'image/jpeg', 'ITEM')).status).toBe(201);
    expect((await upload(JPEG, 'image/jpeg', 'DAMAGE')).status).toBe(201);
    const partial = await submit();
    expect(partial.status).toBe(422);
    expect(errorCode(partial)).toBe('PHOTOS_REQUIRED');
    expect((await upload(JPEG, 'image/jpeg', 'STICKER')).status).toBe(201);
    expect((await upload(JPEG, 'image/jpeg', 'ITEM')).status).toBe(201);
    expect((await upload(JPEG, 'image/jpeg', 'DAMAGE')).status).toBe(201);
    const sixth = await upload(JPEG);
    expect(sixth.status).toBe(409);
    expect(errorCode(sixth)).toBe('PHOTO_LIMIT');
    // Lapis kedua: trigger database menolak foto ke-6 walau backend dilewati.
    await expect(
      db.incidentPhoto.create({ data: { incidentId: id, mimeType: 'image/jpeg', data: JPEG } }),
    ).rejects.toThrow();

    const sent = await submit();
    expect(sent.status).toBe(200);
    expect(data<IncidentDto>(sent)).toMatchObject({ status: 'REPORTED', photoCount: 5 });
    expect(data<IncidentDto>(sent).number).toMatch(/^INC-\d{4}-\d{6}$/);
    const asset = await db.asset.findUniqueOrThrow({ where: { id: a1.id } });
    expect(asset).toMatchObject({ status: 'ISSUE_ON_SITE', condition: 'DAMAGED' });
    // Setelah dikirim: foto tidak bisa ditambah dan tidak bisa dikirim ulang.
    expect(errorCode(await upload(JPEG))).toBe('PHOTO_NOT_ALLOWED');
    expect(errorCode(await submit())).toBe('INVALID_INCIDENT_STATE');
    // Aset yang sama tidak bisa dilaporkan lagi.
    const again = await post(c, c.field, '/incidents', {
      orderNumber: orderNo,
      qrToken: a1.qrToken,
      urgency: 'LOW',
      description: 'rusak lagi',
    });
    expect(errorCode(again)).toBe('ASSET_ALREADY_REPORTED');
    // Foto dapat dibaca kembali; foto/insiden bersifat append-only di database.
    const detail = data<IncidentDto>(await get(c, c.admin, `/incidents/${id}`));
    const photo = await get(c, c.admin, `/incidents/${id}/photos/${detail.photoIds[0]}`);
    expect(photo.status).toBe(200);
    await expect(db.incidentPhoto.deleteMany({ where: { incidentId: id } })).rejects.toThrow();
    await expect(db.incidentEvent.deleteMany({ where: { incidentId: id } })).rejects.toThrow();
  });

  it('end-to-end: lapor → review penggantian → scan gudang → terima → kembali → servis lolos', async () => {
    const c = await setup();
    const { product, assets } = await seedProduct('Panel', 3);
    const { assets: other } = await seedProduct('Kabel', 1);
    const [a1, a2, a3] = assets;
    const [cable] = other;
    if (!a1 || !a2 || !a3 || !cable) throw new Error('seed');
    const { orderId, pickId } = await dispatched(c, product.id, assets, 1);

    const id = await report(c, a1.qrToken);
    const submitted = await post(c, c.field, `/incidents/${id}/submit`);
    expect(submitted.status).toBe(200);

    // Admin menerima notifikasi; pelapor tidak menotifikasi dirinya sendiri.
    const adminNotes = data<NotificationListDto>(await get(c, c.admin, '/notifications'));
    expect(adminNotes.unread).toBe(1);
    expect(adminNotes.items[0]).toMatchObject({ type: 'incident.reported', entityId: id });
    expect(data<NotificationListDto>(await get(c, c.field, '/notifications')).unread).toBe(0);
    expect((await post(c, c.admin, '/notifications/read-all')).status).toBe(200);
    expect(data<NotificationListDto>(await get(c, c.admin, '/notifications')).unread).toBe(0);

    // Keputusan: hanya pemegang incident.review; penolakan wajib alasan.
    expect(
      (await post(c, c.field, `/incidents/${id}/review`, { decision: 'REPLACE' })).status,
    ).toBe(403);
    expect((await post(c, c.admin, `/incidents/${id}/review`, { decision: 'REJECT' })).status).toBe(
      400,
    );
    const review = await post(c, c.admin, `/incidents/${id}/review`, { decision: 'REPLACE' });
    expect(review.status).toBe(200);
    const task = data<IncidentDto>(review).replacement;
    expect(task).toMatchObject({ status: 'PENDING_PICK', oldAsset: { id: a1.id } });
    if (!task) throw new Error('task');
    expect(task.number).toMatch(/^RPL-\d{4}-\d{6}$/);
    expect(
      data<NotificationListDto>(await get(c, c.warehouse, '/notifications')).items[0]?.type,
    ).toBe('replacement.created');
    expect(
      data<NotificationListDto>(await get(c, c.field, '/notifications')).items[0],
    ).toMatchObject({ type: 'incident.reviewed', params: { decision: 'REPLACE' } });

    const scan = (qrToken: string, action: 'PICK' | 'VERIFY', token = c.warehouse) =>
      post(c, token, `/replacement-tasks/${task.id}/scan`, { action, qrToken });

    // Scan salah ditolak dan tercatat: aset rusak itu sendiri, produk lain, belum dipilih.
    expect(errorCode(await scan(a1.qrToken, 'PICK'))).toBe('SCAN_SAME_AS_OLD');
    expect(errorCode(await scan(cable.qrToken, 'PICK'))).toBe('SCAN_PRODUCT_MISMATCH');
    expect(errorCode(await scan(a2.qrToken, 'VERIFY'))).toBe('REPLACEMENT_STATE');
    expect((await scan(a2.qrToken, 'PICK')).status).toBe(200);
    expect(errorCode(await scan(a3.qrToken, 'VERIFY'))).toBe('SCAN_NOT_IN_PICK_LIST');
    expect(
      await db.scanEvent.count({ where: { replacementTaskId: task.id, result: 'REJECTED' } }),
    ).toBe(3);
    // Belum terverifikasi: tidak boleh dikirim.
    expect(errorCode(await post(c, c.warehouse, `/replacement-tasks/${task.id}/dispatch`))).toBe(
      'REPLACEMENT_STATE',
    );
    expect((await scan(a2.qrToken, 'VERIFY')).status).toBe(200);
    expect(
      (
        await post(c, c.field, `/replacement-tasks/${task.id}/scan`, {
          action: 'PICK',
          qrToken: a3.qrToken,
        })
      ).status,
    ).toBe(403);
    const dispatch = await post(c, c.warehouse, `/replacement-tasks/${task.id}/dispatch`);
    expect(dispatch.status).toBe(200);
    expect(data<ReplacementTaskDto>(dispatch)).toMatchObject({
      status: 'DISPATCHED',
      replacementAsset: { id: a2.id },
    });
    expect((await db.asset.findUniqueOrThrow({ where: { id: a2.id } })).status).toBe('IN_TRANSIT');
    expect(data<NotificationListDto>(await get(c, c.field, '/notifications')).items[0]?.type).toBe(
      'replacement.dispatched',
    );

    // PIC lapangan menerima: QR salah ditolak, kondisi rusak ditolak, lalu berhasil.
    const receive = (qrToken: string, condition = 'GOOD') =>
      post(c, c.field, `/replacement-tasks/${task.id}/receive`, { qrToken, condition });
    expect(errorCode(await receive(a3.qrToken))).toBe('SCAN_WRONG_REPLACEMENT');
    expect(errorCode(await receive(a2.qrToken, 'DAMAGED'))).toBe('SCAN_ASSET_DAMAGED');
    const received = await receive(a2.qrToken);
    expect(received.status).toBe(200);
    expect(data<ReplacementTaskDto>(received)).toMatchObject({ status: 'RECEIVED' });
    expect(errorCode(await receive(a2.qrToken))).toBe('REPLACEMENT_STATE');
    expect((await db.asset.findUniqueOrThrow({ where: { id: a2.id } })).status).toBe('ON_SITE');
    const after = data<IncidentDto>(await get(c, c.admin, `/incidents/${id}`));
    expect(after.status).toBe('REPLACED');
    expect(after.replacement).toMatchObject({
      oldAsset: { code: a1.code },
      replacementAsset: { code: a2.code },
      incidentNumber: after.number,
    });

    // Aset pengganti masuk daftar aktif pesanan; aset lama tetap ditandai bermasalah.
    const pick = data<PickListDto>(await get(c, c.warehouse, `/pick-lists/${pickId}`));
    expect(pick.items.map((i) => i.assetCode).sort()).toEqual([a1.code, a2.code].sort());
    expect((await db.asset.findUniqueOrThrow({ where: { id: a1.id } })).status).toBe(
      'ISSUE_ON_SITE',
    );

    // Aset rusak boleh dibawa kembali lebih awal (staf pengantar pengganti): belum kembali → discan gudang.
    expect(after.replacement?.oldAssetReturn).toMatchObject({
      requestedAt: null,
      returnedAt: null,
      condition: null,
    });
    // Penyewa (PIC lapangan) menyerahkan aset rusak; gudang diberi tahu, lalu menerimanya lewat scan.
    const handOver = () =>
      post(c, c.field, `/replacement-tasks/${task.id}/return-old`, { note: 'dibawa kurir' });
    const handed = await handOver();
    expect(handed.status).toBe(200);
    expect(data<ReplacementTaskDto>(handed).oldAssetReturn).toMatchObject({
      requestNote: 'dibawa kurir',
      returnedAt: null,
    });
    expect(data<ReplacementTaskDto>(handed).oldAssetReturn.requestedAt).not.toBeNull();
    expect(errorCode(await handOver())).toBe('REPLACEMENT_STATE');
    expect(
      data<NotificationListDto>(await get(c, c.warehouse, '/notifications')).items.map(
        (n) => n.type,
      ),
    ).toContain('replacement.oldReturnRequested');
    const ret = (qrToken: string, condition: string) =>
      post(c, c.warehouse, `/pick-lists/${pickId}/return/scan`, { qrToken, condition });
    expect((await ret(a1.qrToken, 'GOOD')).status).toBe(200);
    const early = data<IncidentDto>(await get(c, c.admin, `/incidents/${id}`)).replacement;
    expect(early?.oldAssetReturn.condition).toBe('GOOD');
    expect(early?.oldAssetReturn.returnedAt).not.toBeNull();
    expect((await db.asset.findUniqueOrThrow({ where: { id: a1.id } })).status).toBe('QUARANTINED');
    // Tidak bisa discan dua kali; sisanya (aset pengganti) ikut pengembalian saat sewa selesai.
    expect(errorCode(await ret(a1.qrToken, 'GOOD'))).toBe('SCAN_ALREADY_RETURNED');
    expect((await ret(a2.qrToken, 'GOOD')).status).toBe(200);
    expect((await post(c, c.warehouse, `/pick-lists/${pickId}/return/complete`)).status).toBe(200);
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('COMPLETED');
    expect((await db.asset.findUniqueOrThrow({ where: { id: a2.id } })).status).toBe('AVAILABLE');
    expect((await db.asset.findUniqueOrThrow({ where: { id: a1.id } })).status).toBe('QUARANTINED');

    // Belum lolos pemeriksaan: tidak boleh tersedia secara manual, dan insiden tidak bisa ditutup manual.
    const manual = await post(c, c.admin, `/assets/${a1.id}/status`, { status: 'AVAILABLE' });
    expect(errorCode(manual)).toBe('ASSET_NOT_CLEARED');
    expect(
      errorCode(await post(c, c.admin, `/incidents/${id}/close`, { note: 'tutup paksa' })),
    ).toBe('ASSET_NOT_CLEARED');

    // Servis: gudang membuka tiket (aset → IN_SERVICE); biaya hanya terlihat pemegang asset.cost.read.
    const ticketRes = await post(c, c.warehouse, '/service-tickets', {
      assetId: a1.id,
      incidentId: id,
      complaint: 'Ganti modul LED',
    });
    expect(ticketRes.status).toBe(201);
    const ticket = data<ServiceTicketDto>(ticketRes);
    expect(ticket.number).toMatch(/^SVC-\d{4}-\d{6}$/);
    expect(ticket).not.toHaveProperty('cost');
    expect((await db.asset.findUniqueOrThrow({ where: { id: a1.id } })).status).toBe('IN_SERVICE');
    expect(
      errorCode(
        await post(c, c.warehouse, '/service-tickets', { assetId: a1.id, complaint: 'dobel' }),
      ),
    ).toBe('ASSET_NOT_SERVICEABLE');
    const manual2 = await post(c, c.admin, `/assets/${a1.id}/status`, { status: 'AVAILABLE' });
    expect(errorCode(manual2)).toBe('ASSET_NOT_CLEARED');

    const complete = (body: object) =>
      post(c, c.warehouse, `/service-tickets/${ticket.id}/complete`, body);
    const done = {
      actionTaken: 'Modul diganti',
      cost: 750000,
      inspection: 'PASSED',
      conditionAfter: 'GOOD',
    };
    expect(errorCode(await complete(done))).toBe('INVALID_TICKET_STATE'); // belum dimulai
    expect(
      (await post(c, c.warehouse, `/service-tickets/${ticket.id}/start`, { vendor: 'CV Servis' }))
        .status,
    ).toBe(200);
    expect(errorCode(await complete({ ...done, conditionAfter: 'DAMAGED' }))).toBe(
      'INSPECTION_CONDITION',
    );
    // Gagal pemeriksaan: tetap karantina dan insiden tetap terbuka.
    const failed = await complete({ ...done, inspection: 'FAILED', conditionAfter: 'POOR' });
    expect(failed.status).toBe(200);
    expect((await db.asset.findUniqueOrThrow({ where: { id: a1.id } })).status).toBe('QUARANTINED');
    expect(data<IncidentDto>(await get(c, c.admin, `/incidents/${id}`)).status).toBe('REPLACED');

    // Tiket kedua lolos: aset tersedia, insiden ditutup otomatis, biaya tampil untuk admin.
    const second = data<ServiceTicketDto>(
      await post(c, c.warehouse, '/service-tickets', { assetId: a1.id, complaint: 'Cek ulang' }),
    );
    await post(c, c.warehouse, `/service-tickets/${second.id}/start`);
    const passed = await post(c, c.warehouse, `/service-tickets/${second.id}/complete`, done);
    expect(passed.status).toBe(200);
    expect(data<ServiceTicketDto>(passed)).not.toHaveProperty('cost');
    const adminView = data<ServiceTicketDto>(
      await get(c, c.admin, `/service-tickets/${second.id}`),
    );
    expect(adminView).toMatchObject({ status: 'COMPLETED', cost: 750000, inspection: 'PASSED' });
    expect(await db.asset.findUniqueOrThrow({ where: { id: a1.id } })).toMatchObject({
      status: 'AVAILABLE',
      condition: 'GOOD',
    });
    const closed = data<IncidentDto>(await get(c, c.admin, `/incidents/${id}`));
    expect(closed.status).toBe('CLOSED');
    expect(closed.serviceTickets).toHaveLength(1); // hanya tiket yang ditautkan ke insiden
    expect(closed.events.map((e) => e.toStatus)).toEqual([
      'DRAFT',
      'REPORTED',
      'REPLACEMENT_IN_PROGRESS',
      'REPLACED',
      'CLOSED',
    ]);
    // Jejak audit mencakup seluruh langkah penting.
    const actions = (await db.auditLog.findMany({ select: { action: true } })).map((a) => a.action);
    for (const a of [
      'incident.submit',
      'incident.review',
      'replacement.pick',
      'replacement.verify',
      'replacement.dispatch',
      'replacement.receive',
      'service_ticket.complete',
    ]) {
      expect(actions).toContain(a);
    }
  });

  it('tolak mengembalikan aset; teknisi membuat tiket di lokasi; panduan lalu tuntas', async () => {
    const c = await setup();
    const { product, assets } = await seedProduct('Speaker', 3);
    const [a1, a2, a3] = assets;
    if (!a1 || !a2 || !a3) throw new Error('seed');
    await dispatched(c, product.id, assets, 3);

    // Tolak: alasan wajib; aset kembali ke status/kondisi semula.
    const rejectId = await report(c, a1.qrToken);
    await post(c, c.field, `/incidents/${rejectId}/submit`);
    const rejected = await post(c, c.admin, `/incidents/${rejectId}/review`, {
      decision: 'REJECT',
      note: 'Hanya baret kosmetik',
    });
    expect(rejected.status).toBe(200);
    expect(data<IncidentDto>(rejected)).toMatchObject({ status: 'REJECTED', decision: 'REJECT' });
    expect(await db.asset.findUniqueOrThrow({ where: { id: a1.id } })).toMatchObject({
      status: 'CHECKED_OUT',
      condition: 'GOOD',
    });
    expect(
      errorCode(
        await post(c, c.admin, `/incidents/${rejectId}/review`, {
          decision: 'GUIDANCE',
          note: 'x yz',
        }),
      ),
    ).toBe('INVALID_INCIDENT_STATE');

    // Teknisi: tiket servis otomatis tertaut; aset tetap bermasalah di lokasi.
    const techId = await report(c, a2.qrToken);
    await post(c, c.field, `/incidents/${techId}/submit`);
    expect(
      (await post(c, c.admin, `/incidents/${techId}/review`, { decision: 'TECHNICIAN' })).status,
    ).toBe(400);
    const tech = await post(c, c.admin, `/incidents/${techId}/review`, {
      decision: 'TECHNICIAN',
      technicianName: 'Pak Rudi',
    });
    expect(tech.status).toBe(200);
    const techDto = data<IncidentDto>(tech);
    expect(techDto).toMatchObject({ status: 'TECHNICIAN_ASSIGNED', technicianName: 'Pak Rudi' });
    expect(techDto.serviceTickets).toHaveLength(1);
    expect(techDto.serviceTickets[0]).toMatchObject({ status: 'OPEN', vendor: 'Pak Rudi' });
    expect((await db.asset.findUniqueOrThrow({ where: { id: a2.id } })).status).toBe(
      'ISSUE_ON_SITE',
    );
    // Tuntas di lokasi: kondisi wajib tidak rusak; tiket terbuka dibatalkan otomatis.
    const dmg = await post(c, c.admin, `/incidents/${techId}/close`, {
      note: 'Sudah diperbaiki',
      condition: 'DAMAGED',
    });
    expect(errorCode(dmg)).toBe('CONDITION_DAMAGED');
    const closed = await post(c, c.admin, `/incidents/${techId}/close`, {
      note: 'Sudah diperbaiki teknisi',
      condition: 'FAIR',
    });
    expect(closed.status).toBe(200);
    expect(data<IncidentDto>(closed).serviceTickets[0]?.status).toBe('CANCELLED');
    expect(await db.asset.findUniqueOrThrow({ where: { id: a2.id } })).toMatchObject({
      status: 'CHECKED_OUT',
      condition: 'FAIR',
    });

    // Panduan perbaikan lalu eskalasi ke penggantian ditolak bila pesanan sudah selesai dikembalikan.
    const guideId = await report(c, a3.qrToken);
    await post(c, c.field, `/incidents/${guideId}/submit`);
    const guide = await post(c, c.admin, `/incidents/${guideId}/review`, {
      decision: 'GUIDANCE',
      note: 'Cabut dan pasang ulang kabel',
    });
    expect(data<IncidentDto>(guide)).toMatchObject({ status: 'GUIDANCE_GIVEN' });
    const escalate = await post(c, c.admin, `/incidents/${guideId}/review`, {
      decision: 'REPLACE',
    });
    expect(escalate.status).toBe(200);
    const task = data<IncidentDto>(escalate).replacement;
    expect(task?.status).toBe('PENDING_PICK');
    // Batalkan tugas: insiden kembali menunggu keputusan.
    const cancelled = await post(c, c.admin, `/replacement-tasks/${task?.id}/cancel`, {
      reason: 'Tidak ada stok pengganti',
    });
    expect(cancelled.status).toBe(200);
    expect(data<IncidentDto>(await get(c, c.admin, `/incidents/${guideId}`))).toMatchObject({
      status: 'REPORTED',
      replacement: null,
    });
  });

  it('tiket servis: validasi, pembatalan memulihkan aset, dan hanya satu tiket terbuka', async () => {
    const c = await setup();
    const { assets } = await seedProduct('Lampu', 2);
    const [a1, a2] = assets;
    if (!a1 || !a2) throw new Error('seed');

    const created = await post(c, c.admin, '/service-tickets', {
      assetId: a1.id,
      complaint: 'Servis berkala',
      vendor: 'CV Teknik',
    });
    expect(created.status).toBe(201);
    const ticket = data<ServiceTicketDto>(created);
    expect(ticket).toMatchObject({ status: 'OPEN', cost: null });
    expect((await db.asset.findUniqueOrThrow({ where: { id: a1.id } })).status).toBe('IN_SERVICE');
    expect(
      errorCode(await post(c, c.admin, '/service-tickets', { assetId: a1.id, complaint: 'ganda' })),
    ).toBe('ASSET_NOT_SERVICEABLE');
    expect((await post(c, c.admin, '/service-tickets', { assetId: a2.id })).status).toBe(400);

    const cancel = await post(c, c.admin, `/service-tickets/${ticket.id}/cancel`, {
      reason: 'Salah input',
    });
    expect(cancel.status).toBe(200);
    expect(data<ServiceTicketDto>(cancel).status).toBe('CANCELLED');
    expect((await db.asset.findUniqueOrThrow({ where: { id: a1.id } })).status).toBe('AVAILABLE');
    expect(
      errorCode(await post(c, c.admin, `/service-tickets/${ticket.id}/cancel`, { reason: 'lagi' })),
    ).toBe('INVALID_TICKET_STATE');
    // Aset yang sedang dialokasikan/di luar gudang tidak dapat diservis.
    await db.asset.update({ where: { id: a2.id }, data: { status: 'CHECKED_OUT' } });
    expect(
      errorCode(
        await post(c, c.admin, '/service-tickets', { assetId: a2.id, complaint: 'tidak boleh' }),
      ),
    ).toBe('ASSET_NOT_SERVICEABLE');
    expect((await get(c, c.admin, '/service-tickets?status=CANCELLED')).status).toBe(200);
  });
});

describe('Portal pelanggan — akses per pesanan (no HP + no pesanan)', () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  const portalLogin = (c: Ctx, phone: string, orderNumber: string) =>
    request(c.app).post(`${V1}/portal/login`).send({ phone, orderNumber });

  it('login hanya dengan HP + nomor pesanan yang cocok; format HP bebas', async () => {
    const c = await setup();
    const { product, assets } = await seedProduct('Panel', 3);
    await dispatched(c, product.id, assets, 1);
    for (const phone of ['081234567890', '+62 812-3456-7890', '812 3456 7890']) {
      const ok = await portalLogin(c, phone, orderNo.toLowerCase());
      expect(ok.status).toBe(200);
      expect(data<{ orderNumber: string }>(ok).orderNumber).toBe(orderNo);
    }
    const badPhone = await portalLogin(c, '081200000000', orderNo);
    expect(badPhone.status).toBe(401);
    expect(errorCode(badPhone)).toBe('INVALID_PORTAL_CREDENTIALS');
    const badOrder = await portalLogin(c, '081234567890', 'ORD-NOPE-1');
    expect(badOrder.status).toBe(401);
    expect(errorCode(badOrder)).toBe('INVALID_PORTAL_CREDENTIALS');
    // Pesanan DRAFT belum terlihat pelanggan.
    const draft = await post(c, c.admin, '/orders', {
      customerId: c.customerId,
      startDate: '2027-06-01',
      endDate: '2027-06-02',
      eventLocation: 'Gedung',
      items: [{ productId: product.id, quantity: 1 }],
    });
    const denied = await portalLogin(c, '081234567890', data<OrderDto>(draft).number);
    expect(denied.status).toBe(401);
  });

  it('pelanggan menandatangani dokumen pesanannya sendiri (peran penerima), sekali saja', async () => {
    const c = await setup();
    const { product, assets } = await seedProduct('Panel', 4);
    await dispatched(c, product.id, assets, 1);
    const orderA = orderNo;
    await dispatched(c, product.id, assets.slice(1), 1);
    const orderB = orderNo;
    const login = async (n: string) =>
      data<{ accessToken: string }>(await portalLogin(c, '081234567890', n)).accessToken;
    const sessionA = await login(orderA);
    const sessionB = await login(orderB);
    const view = data<PortalOrderDto>(await get(c, sessionA, '/portal/order'));
    const doc = view.documents[0];
    const viewB = data<PortalOrderDto>(await get(c, sessionB, '/portal/order'));
    const docB = viewB.documents[0];
    if (!doc || !docB) throw new Error('docs');
    expect(doc.counterpartSigned).toBe(false);
    expect(doc.signers.map((s) => s.name)).toContain('Budi');
    const signer = doc.signers.find((s) => s.name === 'Budi');
    if (!signer) throw new Error('signer');
    const body = { picId: signer.id, image: PNG_1X1 };
    const sign = (token: string, id: string, payload: object = body) =>
      post(c, token, `/portal/documents/${id}/sign`, payload);

    // Dokumen pesanan lain tertutup; PNG tidak valid ditolak; staf tidak punya rute ini.
    expect((await sign(sessionA, docB.id)).status).toBe(404);
    expect(
      errorCode(await sign(sessionA, doc.id, { ...body, image: 'data:image/png;base64,AAAA' })),
    ).toBe('INVALID_IMAGE');
    expect((await sign(c.admin, doc.id)).status).toBe(403);

    expect((await sign(sessionA, doc.id)).status).toBe(200);
    const after = data<PortalOrderDto>(await get(c, sessionA, '/portal/order')).documents[0];
    expect(after?.counterpartSigned).toBe(true);
    expect(
      await db.documentSignature.count({ where: { documentId: doc.id, role: 'COUNTERPART' } }),
    ).toBe(1);
    // Tanda tangan append-only: tidak bisa menimpa.
    expect(errorCode(await sign(sessionA, doc.id))).toBe('ALREADY_SIGNED');

    // Pesanan B: pemesan menandatangani sendiri tanpa memilih PIC (nama dari data pelanggan).
    expect((await sign(sessionB, docB.id, { image: PNG_1X1 })).status).toBe(200);
    const bySelf = await db.documentSignature.findFirstOrThrow({
      where: { documentId: docB.id, role: 'COUNTERPART' },
    });
    expect(bySelf.picId).toBeNull();
    expect(bySelf.signerName).toBe(
      (await db.customer.findUniqueOrThrow({ where: { id: c.customerId } })).name,
    );
  });

  it('token hanya untuk satu pesanan: data, dokumen, dan insiden pesanan lain tertutup', async () => {
    const c = await setup();
    const { product, assets } = await seedProduct('Panel', 4);
    await dispatched(c, product.id, assets, 1);
    const orderA = orderNo;
    await dispatched(c, product.id, assets.slice(1), 1);
    const orderB = orderNo;
    const [a, b] = [assets[0], assets[1]];
    if (!a || !b) throw new Error('seed');

    const sessionA = data<{ accessToken: string }>(
      await portalLogin(c, '081234567890', orderA),
    ).accessToken;
    const sessionB = data<{ accessToken: string }>(
      await portalLogin(c, '081234567890', orderB),
    ).accessToken;

    const rawA = await get(c, sessionA, '/portal/order');
    const viewA = data<PortalOrderDto>(rawA);
    expect(viewA.number).toBe(orderA);
    expect(viewA.assets.map((x) => x.code)).toEqual([a.code]);
    expect(viewA.assets[0]?.reportable).toBe(true);
    expect(viewA.items[0]?.quantity).toBe(1);
    expect(viewA.documents.length).toBeGreaterThan(0);
    const viewB = data<PortalOrderDto>(await get(c, sessionB, '/portal/order'));
    expect(viewB.assets.map((x) => x.code)).toEqual([b.code]);

    // Staf tidak punya tampilan portal.
    expect((await get(c, c.admin, '/portal/order')).status).toBe(403);
    // Token portal tidak bisa menyentuh API staf.
    for (const path of ['/orders', '/customers', '/notifications', '/assets']) {
      const res = await get(c, sessionA, path);
      expect(res.status).toBe(403);
    }

    // PDF: dokumen sendiri boleh, dokumen pesanan lain 404.
    const docA = viewA.documents[0];
    const docB = viewB.documents[0];
    if (!docA || !docB) throw new Error('docs');
    const pdf = await get(c, sessionA, `/handover-documents/${docA.id}/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect((await get(c, sessionA, `/handover-documents/${docB.id}/pdf`)).status).toBe(404);

    // Lapor kerusakan: hanya aset pada pesanannya sendiri.
    const other = await post(c, sessionA, '/incidents', {
      orderNumber: orderB,
      assetCode: b.code,
      urgency: 'LOW',
      description: 'Aset milik pesanan lain',
    });
    expect(other.status).toBe(409);
    expect(errorCode(other)).toBe('ASSET_NOT_ON_ORDER');

    orderNo = orderA;
    const incidentId = await report(c, a.qrToken, 3, sessionA);
    const submitted = await post(c, sessionA, `/incidents/${incidentId}/submit`);
    expect(submitted.status).toBe(200);
    expect(data<IncidentDto>(submitted).status).toBe('REPORTED');

    const list = data<{ items: { id: string }[] }>(await get(c, sessionA, '/incidents'));
    expect(list.items.map((i) => i.id)).toEqual([incidentId]);
    // Pesanan B tidak melihat insiden pesanan A, dan tidak bisa mengubahnya.
    expect(data<{ items: unknown[] }>(await get(c, sessionB, '/incidents')).items).toHaveLength(0);
    expect((await get(c, sessionB, `/incidents/${incidentId}`)).status).toBe(404);
    const photo = await request(c.app)
      .post(`${V1}/incidents/${incidentId}/photos`)
      .query({ kind: 'ITEM' })
      .set(auth(sessionB))
      .set('Content-Type', 'image/jpeg')
      .send(JPEG);
    expect(photo.status).toBe(403);
    // Daftar pesanan yang bisa dilaporkan hanya pesanannya sendiri.
    const orders = data<{ number: string }[]>(
      await get(c, sessionB, '/incidents/reportable-orders'),
    );
    expect(orders.map((o) => o.number)).toEqual([orderB]);
  });
});
