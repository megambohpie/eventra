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

async function product(c: Ctx, name: string, extra: object = {}) {
  const category =
    (await db.category.findFirst({ where: { name: 'LED' } })) ??
    (await db.category.create({ data: { name: 'LED' } }));
  const res = await request(c.app)
    .post(`${V1}/products`)
    .set(auth(c.admin))
    .send({
      name,
      categoryId: category.id,
      pricingUnit: 'PCS',
      unitLabel: 'pcs',
      price: 0,
      deposit: 0,
      ...extra,
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
        data: {
          code: `AST-M${String(seq).padStart(5, '0')}`,
          qrToken: `qr-pool-${String(seq).padStart(4, '0')}-xxxxxxxxxxxx`,
          productId,
        },
      }),
    );
  }
  return rows;
}

/** Videotron per m² (500.000/m²) dengan kabinet 100x50 ×6 dan 50x50 ×8 = 5 m². */
async function seedPool(c: Ctx) {
  const pool = await product(c, 'Videotron per m²', {
    unitLabel: 'm²',
    price: 500_000,
    stockMode: 'AREA_POOL',
  });
  const big = await product(c, 'LED 100x50', { widthCm: 100, heightCm: 50, areaPoolId: pool.id });
  const small = await product(c, 'LED 50x50', { widthCm: 50, heightCm: 50, areaPoolId: pool.id });
  const bigAssets = await assets(big.id, 6);
  const smallAssets = await assets(small.id, 8);
  return { pool, big, small, bigAssets, smallAssets };
}

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

const check = (c: Ctx, items: { productId: string; quantity: number }[]) =>
  request(c.app)
    .post(`${V1}/availability/check`)
    .set(auth(c.admin))
    .send({ startDate: '2027-03-08', endDate: '2027-03-09', items });

describe('Kelompok "per meter": pesan dalam m², gudang bebas memilih ukuran kabinet', () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  it('konfigurasi: anggota wajib ukuran dan kelompok valid; produk kelompok tanpa aset', async () => {
    const c = await setup();
    const { pool, big } = await seedPool(c);
    expect(big.areaPoolId).toBe(pool.id);
    const category = await db.category.findFirstOrThrow();
    const body = (extra: object) => ({
      name: 'X',
      categoryId: category.id,
      pricingUnit: 'PCS',
      unitLabel: 'pcs',
      price: 0,
      deposit: 0,
      ...extra,
    });
    const post = (b: object) => request(c.app).post(`${V1}/products`).set(auth(c.admin)).send(b);

    expect((await post(body({ areaPoolId: pool.id }))).status).toBe(400); // tanpa ukuran
    expect(errorCode(await post(body({ areaPoolId: big.id, widthCm: 10, heightCm: 10 })))).toBe(
      'INVALID_REFERENCE',
    ); // target bukan kelompok per meter
    expect(
      (await post(body({ areaPoolId: pool.id, widthCm: 10, heightCm: 10, stockMode: 'UNLIMITED' })))
        .status,
    ).toBe(400);

    // Produk kelompok tidak punya aset sendiri; tidak bisa diubah selagi masih punya anggota.
    const asset = await request(c.app)
      .post(`${V1}/assets`)
      .set(auth(c.admin))
      .send({ productId: pool.id });
    expect(errorCode(asset)).toBe('PRODUCT_UNLIMITED');
    const back = await request(c.app)
      .put(`${V1}/products/${pool.id}`)
      .set(auth(c.admin))
      .send(body({ name: pool.name, stockMode: 'TRACKED' }));
    expect(errorCode(back)).toBe('POOL_HAS_MEMBERS');
  });

  it('ketersediaan dalam m²; kabinet tidak bisa dipesan langsung; alokasi mengurangi luas', async () => {
    const c = await setup();
    const { pool, big } = await seedPool(c);

    const all = data<AvailabilityResultDto>(await check(c, [{ productId: pool.id, quantity: 5 }]));
    expect(all.ok).toBe(true);
    expect(all.items[0]?.components[0]).toMatchObject({ total: 5, minRemaining: 5 });
    const over = data<AvailabilityResultDto>(await check(c, [{ productId: pool.id, quantity: 6 }]));
    expect(over.ok).toBe(false);
    expect(over.items[0]?.maxQuantity).toBe(5);

    // Kabinet anggota hanya dipesan lewat produk meter.
    const direct = await request(c.app)
      .post(`${V1}/orders`)
      .set(auth(c.admin))
      .send({
        customerId: c.customerId,
        startDate: '2027-03-08',
        endDate: '2027-03-09',
        eventLocation: 'Balai Kartini',
        items: [{ productId: big.id, quantity: 1 }],
      });
    expect(direct.status).toBe(409);
    expect(errorCode(direct)).toBe('PRODUCT_POOLED');

    const o = await order(c, [{ productId: pool.id, quantity: 2 }]);
    expect(o.subtotal).toBe(2 * 500_000 * 2); // 2 m² × tarif × 2 hari
    const allocated = await db.stockAllocation.findMany({ where: { orderId: o.id } });
    expect(new Set(allocated.map((a) => a.productId))).toEqual(new Set([pool.id]));
    const left = data<AvailabilityResultDto>(await check(c, [{ productId: pool.id, quantity: 4 }]));
    expect(left.items[0]?.maxQuantity).toBe(3);
    expect(left.ok).toBe(false);
  });

  it('gudang: ukuran bebas tetapi luas tidak boleh melebihi dan harus pas; aksesori tambahan', async () => {
    const c = await setup();
    const { pool, bigAssets, smallAssets } = await seedPool(c);
    const pole = await product(c, 'Tiang sangga');
    const poles = await assets(pole.id, 2);
    const cable = await product(c, 'Kabel jumper', { stockMode: 'UNLIMITED' });
    const o = await order(c, [{ productId: pool.id, quantity: 2 }]); // 2 m²

    const post = (path: string, body: object = {}, token = c.warehouse) =>
      request(c.app).post(`${V1}${path}`).set(auth(token)).send(body);
    const pick = data<PickListDto>(await post('/pick-lists', { orderId: o.id }));
    expect(pick.lines).toHaveLength(1);
    expect(pick.lines[0]).toMatchObject({ areaPool: true, required: 2, picked: 0 });

    const scan = (body: object) => post(`/pick-lists/${pick.id}/scan`, body);
    const pickQr = (a: { qrToken: string }, extra = false) =>
      scan({ action: 'PICK', qrToken: a.qrToken, ...(extra ? { extra: true } : {}) });
    const verify = (a: { qrToken: string }) => scan({ action: 'VERIFY', qrToken: a.qrToken });
    const status = async () =>
      data<PickListDto>(
        await request(c.app).get(`${V1}/pick-lists/${pick.id}`).set(auth(c.warehouse)),
      );

    // 2 × 100x50 (1 m²) + 3 × 50x50 (0,75 m²) = 1,75 m²
    const chosen = [bigAssets[0], bigAssets[1], smallAssets[0], smallAssets[1], smallAssets[2]];
    for (const a of chosen) expect((await pickQr(a as { qrToken: string })).status).toBe(200);
    expect((await status()).lines[0]).toMatchObject({ picked: 1.75, verified: 0 });

    // Aksesori di luar kebutuhan: ditolak tanpa tanda "tambahan", diterima dengan tanda itu.
    const rejectedPole = await pickQr(poles[0] as { qrToken: string });
    expect(errorCode(rejectedPole)).toBe('SCAN_PRODUCT_NOT_REQUIRED');
    expect((await pickQr(poles[0] as { qrToken: string }, true)).status).toBe(200);
    // Kabinet tidak boleh dijadikan "tambahan" untuk menyiasati batas luas.
    expect(errorCode(await pickQr(bigAssets[2] as { qrToken: string }, true))).toBe(
      'SCAN_EXTRA_POOLED',
    );

    for (const a of [...chosen, poles[0]]) {
      expect((await verify(a as { qrToken: string })).status).toBe(200);
    }
    // Luas baru 1,75 m² dari 2 m²: belum siap keluar.
    expect((await status()).status).toBe('OPEN');
    expect((await post(`/pick-lists/${pick.id}/checkout`)).status).toBe(409);

    // Kabinet ke-4 ukuran 50x50 menggenapi 2 m²; kabinet berikutnya melebihi → ditolak.
    expect((await pickQr(smallAssets[3] as { qrToken: string })).status).toBe(200);
    const tooMuch = await pickQr(smallAssets[4] as { qrToken: string });
    expect(tooMuch.status).toBe(409);
    expect(errorCode(tooMuch)).toBe('SCAN_AREA_EXCEEDED');
    expect(errorCode(await pickQr(bigAssets[3] as { qrToken: string }))).toBe('SCAN_AREA_EXCEEDED');
    expect((await verify(smallAssets[3] as { qrToken: string })).status).toBe(200);
    expect((await status()).status).toBe('VERIFIED');

    // Kabel tambahan (stok tidak terbatas) di luar pesanan; dihitung jumlahnya.
    const counted = await post(`/pick-lists/${pick.id}/count`, {
      action: 'OUT',
      productId: cable.id,
      quantity: 20,
      extra: true,
    });
    expect(counted.status).toBe(200);
    expect(data<PickListDto>(counted).status).toBe('VERIFIED');
    expect(data<PickListDto>(counted).lines.find((l) => l.productId === cable.id)).toMatchObject({
      extra: true,
      unlimited: true,
      packed: 20,
    });

    // Tanda tambahan pada produk berQR yang bukan tambahan resmi tidak mengubah hitungan luas.
    const out = await post(`/pick-lists/${pick.id}/checkout`);
    expect(out.status).toBe(200);
    const dispatched = data<PickListDto>(out);
    const outDoc = dispatched.documents.find((d) => d.type === 'OUT') as HandoverDocumentDto;
    expect(outDoc.payload.areaLines).toEqual([
      { productName: 'Videotron per m²', orderedM2: 2, packedM2: 2 },
    ]);
    expect(outDoc.payload.items.find((i) => i.productName === 'Tiang sangga')).toMatchObject({
      extra: true,
      note: 'Tambahan (include)',
    });

    // Kembali: semua item discan; kabel tambahan dihitung kembali (selisih hanya dicatat).
    const everything = [...chosen, smallAssets[3], poles[0]] as { qrToken: string }[];
    for (const a of everything) {
      const r = await post(`/pick-lists/${pick.id}/return/scan`, {
        qrToken: a.qrToken,
        condition: 'GOOD',
      });
      expect(r.status).toBe(200);
    }
    expect(
      (
        await post(`/pick-lists/${pick.id}/count`, {
          action: 'RETURN',
          productId: cable.id,
          quantity: 18,
        })
      ).status,
    ).toBe(200);
    const done = await post(`/pick-lists/${pick.id}/return/complete`);
    expect(done.status).toBe(200);
    const returnDoc = data<PickListDto>(done).documents.find(
      (d) => d.type === 'RETURN',
    ) as HandoverDocumentDto;
    expect(returnDoc.payload.countedLines).toEqual([
      { productName: 'Kabel jumper', required: 0, packed: 20, returned: 18, lost: 2 },
    ]);
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('COMPLETED');
  });
});
