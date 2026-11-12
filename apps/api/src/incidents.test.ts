import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type {
  IncidentDto,
  NotificationListDto,
  OrderDto,
  PickListDto,
  ReplacementTaskDto,
  ServiceTicketDto,
} from '@eventra/shared';
import { PASSWORD, createTestApp, createUser, db, loginAs, resetDb } from '../test/helpers';

const V1 = '/api/v1';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const errorCode = (res: request.Response) => (res.body as { error: { code: string } }).error.code;
const data = <T>(res: request.Response) => (res.body as { data: T }).data;

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
    data: { type: 'COMPANY', name: 'PT Acara', phone: '021' },
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
async function report(c: Ctx, qrToken: string, photos = 2, token = c.field) {
  const draft = await post(c, token, '/incidents', {
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

  it('RBAC: owner hanya baca, gudang tidak melapor, PIC lapangan hanya yang ditugaskan', async () => {
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

    expect((await get(c, owner, '/incidents')).status).toBe(200);
    expect((await get(c, owner, '/service-tickets')).status).toBe(200);
    expect(
      (
        await post(c, owner, '/incidents', {
          qrToken: a1.qrToken,
          urgency: 'LOW',
          description: 'rusak parah',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post(c, c.warehouse, '/incidents', {
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
      qrToken: a1.qrToken,
      urgency: 'LOW',
      description: 'rusak parah',
    });
    expect(rejected.status).toBe(403);
    expect(errorCode(rejected)).toBe('NOT_ASSIGNED');
    expect(
      await db.scanEvent.count({ where: { action: 'INCIDENT_SCAN', result: 'REJECTED' } }),
    ).toBe(1);
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
      qrToken: a2.qrToken,
      urgency: 'LOW',
      description: 'rusak parah',
    });
    expect(wrong.status).toBe(409);
    expect(errorCode(wrong)).toBe('SCAN_WRONG_STATE');
    const unknown = await post(c, c.field, '/incidents', {
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

    const upload = (body: Buffer, type = 'image/jpeg') =>
      request(c.app)
        .post(`${V1}/incidents/${id}/photos`)
        .set(auth(c.field))
        .set('Content-Type', type)
        .send(body);
    expect(errorCode(await upload(Buffer.from('bukan gambar sama sekali')))).toBe('INVALID_IMAGE');
    for (let i = 0; i < 5; i += 1) expect((await upload(JPEG)).status).toBe(201);
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

    // Kembali ke gudang: aset rusak masuk karantina walau dilaporkan kondisi baik (insiden belum tuntas).
    const ret = (qrToken: string, condition: string) =>
      post(c, c.warehouse, `/pick-lists/${pickId}/return/scan`, { qrToken, condition });
    expect((await ret(a1.qrToken, 'GOOD')).status).toBe(200);
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
