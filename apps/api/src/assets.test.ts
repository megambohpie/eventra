import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { AssetDto, AssetEventDto, ReceiptDto, Role } from '@eventra/shared';
import { createTestApp, db, loginAs, resetDb } from '../test/helpers';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const V1 = '/api/v1';

async function seedMaster() {
  const category = await db.category.create({ data: { name: 'LED' } });
  const product = await db.product.create({
    data: {
      name: 'LED Panel P3',
      categoryId: category.id,
      pricingUnit: 'PCS',
      unitLabel: 'panel',
      price: 100000n,
    },
  });
  const location = await db.location.create({ data: { name: 'Gudang Utama' } });
  return { product, location };
}

const receiptBody = (productId: string, locationId: string, extra: object = {}) => ({
  source: 'PURCHASE',
  sourceRef: 'INV-001',
  supplier: 'PT Pemasok',
  locationId,
  receivedDate: '2026-11-10',
  items: [{ productId, quantity: 3, unitCost: 2500000, serials: ['SN-1', 'SN-2'] }],
  ...extra,
});

async function receive(app: Express, token: string, body: object): Promise<ReceiptDto> {
  const draft = await request(app).post(`${V1}/stock-receipts`).set(auth(token)).send(body);
  expect(draft.status).toBe(201);
  const done = await request(app)
    .post(`${V1}/stock-receipts/${(draft.body as { data: ReceiptDto }).data.id}/receive`)
    .set(auth(token));
  expect(done.status).toBe(200);
  return (done.body as { data: ReceiptDto }).data;
}

describe('Fase 02 — aset, QR, penerimaan', () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  it('RBAC: role tanpa capability ditolak, tanpa token 401', async () => {
    const { app } = createTestApp();
    expect((await request(app).get(`${V1}/assets`)).status).toBe(401);
    for (const role of ['FIELD_PIC', 'CUSTOMER'] as Role[]) {
      const token = await loginAs(app, role);
      expect((await request(app).get(`${V1}/assets`).set(auth(token))).status).toBe(403);
      expect((await request(app).get(`${V1}/stock-receipts`).set(auth(token))).status).toBe(403);
      await resetDb();
    }
    const owner = await loginAs(app, 'OWNER');
    const { product } = await seedMaster();
    const res = await request(app)
      .post(`${V1}/assets`)
      .set(auth(owner))
      .send({ productId: product.id });
    expect(res.status).toBe(403);
  });

  it('penerimaan: draft tidak membuat aset; receive membuat aset unik + QR + riwayat asal', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const { product, location } = await seedMaster();

    const draft = await request(app)
      .post(`${V1}/stock-receipts`)
      .set(auth(admin))
      .send(receiptBody(product.id, location.id));
    expect(draft.status).toBe(201);
    expect(await db.asset.count()).toBe(0);
    const draftDto = (draft.body as { data: ReceiptDto }).data;
    expect(draftDto.status).toBe('DRAFT');
    expect(draftDto.number).toMatch(/^RCV-2026-\d{6}$/);

    const done = await request(app)
      .post(`${V1}/stock-receipts/${draftDto.id}/receive`)
      .set(auth(admin));
    expect(done.status).toBe(200);
    const receipt = (done.body as { data: ReceiptDto }).data;
    expect(receipt.status).toBe('RECEIVED');
    expect(receipt.assetIds).toHaveLength(3);
    expect(receipt.receivedBy).toBe('User ADMIN');

    const assets = await db.asset.findMany({ orderBy: { code: 'asc' } });
    expect(new Set(assets.map((a) => a.code)).size).toBe(3);
    expect(new Set(assets.map((a) => a.qrToken)).size).toBe(3);
    expect(assets.map((a) => a.serial)).toEqual(['SN-1', 'SN-2', null]);
    expect(assets.every((a) => a.status === 'AVAILABLE' && a.purchasePrice === 2500000n)).toBe(
      true,
    );

    const history = await request(app)
      .get(`${V1}/assets/${assets[0]?.id}/history`)
      .set(auth(admin));
    const events = (history.body as { data: AssetEventDto[] }).data;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'RECEIVED',
      toStatus: 'AVAILABLE',
      toLocation: 'Gudang Utama',
      receiptNumber: draftDto.number,
      note: 'PURCHASE',
      actor: 'User ADMIN',
    });
  });

  it('receive ganda tidak menggandakan aset (409)', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const { product, location } = await seedMaster();
    const receipt = await receive(app, admin, receiptBody(product.id, location.id));
    const again = await request(app)
      .post(`${V1}/stock-receipts/${receipt.id}/receive`)
      .set(auth(admin));
    expect(again.status).toBe(409);
    expect(await db.asset.count()).toBe(3);

    // Permintaan bersamaan: hanya satu yang menang.
    const draft = await request(app)
      .post(`${V1}/stock-receipts`)
      .set(auth(admin))
      .send(
        receiptBody(product.id, location.id, { items: [{ productId: product.id, quantity: 2 }] }),
      );
    const id = (draft.body as { data: ReceiptDto }).data.id;
    const results = await Promise.all([
      request(app).post(`${V1}/stock-receipts/${id}/receive`).set(auth(admin)),
      request(app).post(`${V1}/stock-receipts/${id}/receive`).set(auth(admin)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await db.asset.count()).toBe(5);
  });

  it('draft dapat diubah/dibatalkan; yang sudah diterima tidak', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const { product, location } = await seedMaster();
    const draft = await request(app)
      .post(`${V1}/stock-receipts`)
      .set(auth(admin))
      .send(receiptBody(product.id, location.id));
    const id = (draft.body as { data: ReceiptDto }).data.id;

    const edited = await request(app)
      .put(`${V1}/stock-receipts/${id}`)
      .set(auth(admin))
      .send(
        receiptBody(product.id, location.id, { items: [{ productId: product.id, quantity: 7 }] }),
      );
    expect(edited.status).toBe(200);
    expect((edited.body as { data: ReceiptDto }).data.totalUnits).toBe(7);

    const cancelled = await request(app).post(`${V1}/stock-receipts/${id}/cancel`).set(auth(admin));
    expect((cancelled.body as { data: ReceiptDto }).data.status).toBe('CANCELLED');
    expect(
      (await request(app).post(`${V1}/stock-receipts/${id}/receive`).set(auth(admin))).status,
    ).toBe(409);

    const done = await receive(app, admin, receiptBody(product.id, location.id));
    const put = await request(app)
      .put(`${V1}/stock-receipts/${done.id}`)
      .set(auth(admin))
      .send(receiptBody(product.id, location.id));
    expect(put.status).toBe(409);
  });

  it('validasi: serial melebihi qty, serial duplikat, qty 0', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const { product, location } = await seedMaster();
    for (const item of [
      { productId: product.id, quantity: 1, serials: ['A', 'B'] },
      { productId: product.id, quantity: 2, serials: ['A', 'A'] },
      { productId: product.id, quantity: 0 },
    ]) {
      const res = await request(app)
        .post(`${V1}/stock-receipts`)
        .set(auth(admin))
        .send(receiptBody(product.id, location.id, { items: [item] }));
      expect(res.status).toBe(400);
    }
  });

  it('serial duplikat per produk menggagalkan seluruh penerimaan', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const { product, location } = await seedMaster();
    await receive(app, admin, receiptBody(product.id, location.id));
    const draft = await request(app)
      .post(`${V1}/stock-receipts`)
      .set(auth(admin))
      .send(
        receiptBody(product.id, location.id, {
          items: [{ productId: product.id, quantity: 2, serials: ['NEW', 'SN-1'] }],
        }),
      );
    const id = (draft.body as { data: ReceiptDto }).data.id;
    const res = await request(app).post(`${V1}/stock-receipts/${id}/receive`).set(auth(admin));
    expect(res.status).toBe(409);
    expect(await db.asset.count()).toBe(3);
    expect((await db.stockReceipt.findUniqueOrThrow({ where: { id } })).status).toBe('DRAFT');
  });

  it('aset rusak saat diterima langsung karantina; tak bisa dialokasikan', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const { product, location } = await seedMaster();
    await receive(
      app,
      admin,
      receiptBody(product.id, location.id, {
        items: [{ productId: product.id, quantity: 1, condition: 'DAMAGED' }],
      }),
    );
    const asset = await db.asset.findFirstOrThrow();
    expect(asset.status).toBe('QUARANTINED');
  });

  it('harga beli hanya untuk capability asset.cost.read (owner/admin), tidak bocor ke gudang', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const { product, location } = await seedMaster();
    const receipt = await receive(app, admin, receiptBody(product.id, location.id));
    const id = receipt.assetIds?.[0] as string;

    const adminAsset = await request(app).get(`${V1}/assets/${id}`).set(auth(admin));
    expect((adminAsset.body as { data: AssetDto }).data.purchasePrice).toBe(2500000);

    const owner = await loginAs(app, 'OWNER');
    const ownerAsset = await request(app).get(`${V1}/assets/${id}`).set(auth(owner));
    expect((ownerAsset.body as { data: AssetDto }).data.purchasePrice).toBe(2500000);

    const wh = await loginAs(app, 'WAREHOUSE');
    for (const path of [`/assets/${id}`, '/assets', `/assets/${id}/history`, '/stock-receipts']) {
      const res = await request(app).get(`${V1}${path}`).set(auth(wh));
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toMatch(/2500000|purchasePrice|unitCost/);
    }
    const detail = await request(app).get(`${V1}/stock-receipts/${receipt.id}`).set(auth(wh));
    expect(JSON.stringify(detail.body)).not.toMatch(/2500000|unitCost/);
  });

  it('scan QR: hanya token acak; respons tanpa harga/pemasok; token asing 404', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const { product, location } = await seedMaster();
    await receive(app, admin, receiptBody(product.id, location.id));
    const asset = await db.asset.findFirstOrThrow({ orderBy: { code: 'asc' } });
    expect(asset.qrToken).not.toContain(asset.code);
    expect(asset.qrToken).toMatch(/^[A-Za-z0-9_-]{24}$/);

    const res = await request(app).get(`${V1}/assets/scan/${asset.qrToken}`).set(auth(admin));
    expect(res.status).toBe(200);
    expect((res.body as { data: object }).data).toEqual({
      id: asset.id,
      code: asset.code,
      productName: 'LED Panel P3',
      condition: 'GOOD',
      status: 'AVAILABLE',
      allocatable: true,
      location: 'Gudang Utama',
    });

    expect(
      (
        await request(app)
          .get(`${V1}/assets/scan/${'x'.repeat(24)}`)
          .set(auth(admin))
      ).status,
    ).toBe(404);
    expect((await request(app).get(`${V1}/assets/scan/abc`).set(auth(admin))).status).toBe(404);
    expect((await request(app).get(`${V1}/assets/scan/${asset.qrToken}`)).status).toBe(401);
  });

  it('QR PNG dan PDF label dibuat backend', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const { product, location } = await seedMaster();
    const receipt = await receive(app, admin, receiptBody(product.id, location.id));
    const ids = (receipt.assetIds ?? []).join(',');

    const png = await request(app)
      .get(`${V1}/assets/${receipt.assetIds?.[0]}/qr.png`)
      .set(auth(admin))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(png.status).toBe(200);
    expect(png.headers['content-type']).toBe('image/png');
    expect((png.body as Buffer).subarray(1, 4).toString()).toBe('PNG');

    const pdf = await request(app)
      .get(`${V1}/assets/labels.pdf?ids=${ids}`)
      .set(auth(admin))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

    expect(
      (await request(app).get(`${V1}/assets/labels.pdf?ids=nope`).set(auth(admin))).status,
    ).toBe(400);
    expect((await request(app).get(`${V1}/assets/labels.pdf`).set(auth(admin))).status).toBe(400);
  });

  it('regenerate QR mencabut token lama dan dicatat tanpa token di riwayat/audit', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const { product, location } = await seedMaster();
    await receive(app, admin, receiptBody(product.id, location.id));
    const before = await db.asset.findFirstOrThrow();
    const res = await request(app).post(`${V1}/assets/${before.id}/qr/regenerate`).set(auth(admin));
    expect(res.status).toBe(200);
    const after = await db.asset.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.qrToken).not.toBe(before.qrToken);
    expect(
      (await request(app).get(`${V1}/assets/scan/${before.qrToken}`).set(auth(admin))).status,
    ).toBe(404);
    expect(
      (await request(app).get(`${V1}/assets/scan/${after.qrToken}`).set(auth(admin))).status,
    ).toBe(200);
    const audits = JSON.stringify(await db.auditLog.findMany());
    expect(audits).not.toContain(before.qrToken);
    expect(audits).not.toContain(after.qrToken);
    const history = await request(app).get(`${V1}/assets/${before.id}/history`).set(auth(admin));
    expect((history.body as { data: AssetEventDto[] }).data[0]?.type).toBe('QR_REGENERATED');
  });

  it('kondisi & status: riwayat append-only, transisi divalidasi, rusak → karantina', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const { product, location } = await seedMaster();
    const receipt = await receive(app, admin, receiptBody(product.id, location.id));
    const id = receipt.assetIds?.[0] as string;
    const wh = await loginAs(app, 'WAREHOUSE');

    const damaged = await request(app)
      .post(`${V1}/assets/${id}/condition`)
      .set(auth(wh))
      .send({ condition: 'DAMAGED', note: 'Layar retak' });
    expect(damaged.status).toBe(200);
    expect((damaged.body as { data: AssetDto }).data).toMatchObject({
      condition: 'DAMAGED',
      status: 'QUARANTINED',
      needsAttention: true,
    });
    expect(
      (
        await request(app)
          .post(`${V1}/assets/${id}/condition`)
          .set(auth(wh))
          .send({ condition: 'DAMAGED' })
      ).status,
    ).toBe(409);

    // Rusak tak bisa langsung tersedia.
    const blocked = await request(app)
      .post(`${V1}/assets/${id}/status`)
      .set(auth(wh))
      .send({ status: 'AVAILABLE' });
    expect(blocked.status).toBe(409);
    expect((blocked.body as { error: { code: string } }).error.code).toBe(
      'CONDITION_BLOCKS_AVAILABLE',
    );

    await request(app)
      .post(`${V1}/assets/${id}/status`)
      .set(auth(wh))
      .send({ status: 'IN_SERVICE', note: 'Kirim servis' });
    await request(app)
      .post(`${V1}/assets/${id}/condition`)
      .set(auth(wh))
      .send({ condition: 'GOOD' });
    const back = await request(app)
      .post(`${V1}/assets/${id}/status`)
      .set(auth(wh))
      .send({ status: 'AVAILABLE' });
    expect(back.status).toBe(200);

    // Transisi operasional tidak boleh manual.
    expect(
      (
        await request(app)
          .post(`${V1}/assets/${id}/status`)
          .set(auth(wh))
          .send({ status: 'CHECKED_OUT' })
      ).status,
    ).toBe(409);

    const history = await request(app).get(`${V1}/assets/${id}/history`).set(auth(admin));
    const types = (history.body as { data: AssetEventDto[] }).data.map((e) => e.type);
    expect(types).toEqual([
      'STATUS_CHANGED',
      'CONDITION_CHANGED',
      'STATUS_CHANGED',
      'CONDITION_CHANGED',
      'RECEIVED',
    ]);

    // Pensiun bersifat final.
    await request(app)
      .post(`${V1}/assets/${id}/status`)
      .set(auth(admin))
      .send({ status: 'RETIRED' });
    expect(
      (
        await request(app)
          .post(`${V1}/assets/${id}/status`)
          .set(auth(admin))
          .send({ status: 'AVAILABLE' })
      ).status,
    ).toBe(409);
    expect(
      (await request(app).put(`${V1}/assets/${id}`).set(auth(admin)).send({ notes: 'x' })).status,
    ).toBe(409);
  });

  it('CRUD aset: buat, ubah (lokasi tercatat), daftar dengan filter & ringkasan', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const { product, location } = await seedMaster();
    const other = await db.location.create({ data: { name: 'Gudang B' } });

    const created = await request(app).post(`${V1}/assets`).set(auth(admin)).send({
      productId: product.id,
      serial: 'ZX-9',
      condition: 'FAIR',
      locationId: location.id,
      supplier: 'CV Baru',
      purchaseDate: '2026-01-05',
      purchasePrice: 1000000,
    });
    expect(created.status).toBe(201);
    const asset = (created.body as { data: AssetDto }).data;
    expect(asset.code).toMatch(/^AST-\d{6}$/);
    expect(asset).toMatchObject({ purchaseDate: '2026-01-05', purchasePrice: 1000000 });

    // Serial sama pada produk yang sama ditolak.
    const dup = await request(app)
      .post(`${V1}/assets`)
      .set(auth(admin))
      .send({ productId: product.id, serial: 'ZX-9' });
    expect(dup.status).toBe(409);

    const upd = await request(app)
      .put(`${V1}/assets/${asset.id}`)
      .set(auth(admin))
      .send({ serial: 'ZX-9', supplier: 'CV Baru', locationId: other.id, purchasePrice: 1200000 });
    expect(upd.status).toBe(200);
    expect((upd.body as { data: AssetDto }).data.location?.name).toBe('Gudang B');
    const history = await request(app).get(`${V1}/assets/${asset.id}/history`).set(auth(admin));
    const events = (history.body as { data: AssetEventDto[] }).data;
    expect(events.map((e) => e.type).sort()).toEqual(['CREATED', 'LOCATION_CHANGED', 'UPDATED']);
    expect(events.find((e) => e.type === 'UPDATED')?.note).toBe('purchasePrice');
    expect(JSON.stringify(events)).not.toMatch(/1200000/);

    await receive(app, admin, receiptBody(product.id, location.id));

    const list = async (qs: string) =>
      (
        (await request(app).get(`${V1}/assets?${qs}`).set(auth(admin))).body as {
          data: { items: AssetDto[]; total: number };
        }
      ).data;
    expect((await list('')).total).toBe(4);
    expect((await list('locationId=' + other.id)).total).toBe(1);
    expect((await list('condition=FAIR')).total).toBe(1);
    expect((await list('q=SN-1')).total).toBe(1);
    expect((await list('q=led panel')).total).toBe(4);
    expect((await list('attention=true')).total).toBe(0);
    expect((await list('pageSize=2&page=2')).items).toHaveLength(2);
    expect((await request(app).get(`${V1}/assets?status=NOPE`).set(auth(admin))).status).toBe(400);

    await request(app)
      .post(`${V1}/assets/${asset.id}/condition`)
      .set(auth(admin))
      .send({ condition: 'POOR' });
    expect((await list('attention=true')).total).toBe(1);
    expect((await list('attention=false')).total).toBe(3);

    const summary = await request(app).get(`${V1}/assets/summary`).set(auth(admin));
    expect((summary.body as { data: object }).data).toEqual({
      total: 4,
      attention: 1,
      byStatus: { AVAILABLE: 4 },
      byCondition: { GOOD: 3, POOR: 1 },
    });
  });

  it('audit log tercatat untuk operasi tulis aset dan penerimaan', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const { product, location } = await seedMaster();
    const receipt = await receive(app, admin, receiptBody(product.id, location.id));
    await request(app)
      .post(`${V1}/assets/${receipt.assetIds?.[0]}/condition`)
      .set(auth(admin))
      .send({ condition: 'FAIR' });
    const actions = (await db.auditLog.findMany()).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining(['stock_receipt.create', 'stock_receipt.receive', 'asset.condition']),
    );
  });
});
