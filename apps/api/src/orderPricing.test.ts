import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { OrderDto, ProductDto } from '@eventra/shared';
import { createTestApp, db, loginAs, resetDb } from '../test/helpers';

const V1 = '/api/v1';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const errorCode = (res: request.Response) => (res.body as { error: { code: string } }).error.code;
const data = <T>(res: request.Response) => (res.body as { data: T }).data;

/** Dua produk (100.000 dan 50.000 per hari, masing-masing 10 aset) dan satu pelanggan. */
async function setup() {
  const { app } = createTestApp();
  const admin = await loginAs(app, 'ADMIN');
  const category = await db.category.create({ data: { name: 'Audio' } });
  const customer = await db.customer.create({
    data: { type: 'COMPANY', name: 'PT Acara', phone: '021' },
  });
  const make = async (name: string, price: number) =>
    data<ProductDto>(
      await request(app).post(`${V1}/products`).set(auth(admin)).send({
        name,
        categoryId: category.id,
        pricingUnit: 'PCS',
        unitLabel: 'pcs',
        price,
        deposit: 10_000,
      }),
    );
  const speaker = await make('Speaker', 100_000);
  const mic = await make('Mic', 50_000);
  let n = 0;
  for (const product of [speaker, mic]) {
    for (let i = 0; i < 10; i += 1) {
      n += 1;
      await db.asset.create({
        data: {
          code: `AST-Q${String(n).padStart(5, '0')}`,
          qrToken: `qr-pricing-${String(n).padStart(4, '0')}-xxxxxxxx`,
          productId: product.id,
        },
      });
    }
  }
  const base = {
    customerId: customer.id,
    startDate: '2027-04-01',
    endDate: '2027-04-02', // 2 hari
    eventLocation: 'Balai Kartini',
  };
  const create = (body: object) =>
    request(app)
      .post(`${V1}/orders`)
      .set(auth(admin))
      .send({ ...base, ...body });
  return { app, admin, speaker, mic, create };
}

describe('Harga negosiasi dan borongan pada pesanan', () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  it('harga baris hasil negosiasi dipakai; harga default tersimpan sebagai pembanding', async () => {
    const { speaker, mic, create } = await setup();
    const res = await create({
      items: [
        { productId: speaker.id, quantity: 2, unitPrice: 80_000 }, // dinego dari 100.000
        { productId: mic.id, quantity: 4 }, // memakai harga default 50.000
      ],
    });
    expect(res.status).toBe(201);
    const order = data<OrderDto>(res);
    expect(order.pricingMode).toBe('LINE');
    expect(order.lumpTotal).toBeNull();
    const line = (name: string) => order.items.find((i) => i.productName === name);
    expect(line('Speaker')).toMatchObject({ unitPrice: 80_000, listPrice: 100_000 });
    expect(line('Mic')).toMatchObject({ unitPrice: 50_000, listPrice: 50_000 });
    // (80.000×2 + 50.000×4) × 2 hari = 720.000; menurut harga default (100.000×2 + 50.000×4) × 2 = 800.000
    expect(order.subtotal).toBe(720_000);
    expect(order.listSubtotal).toBe(800_000);
    expect(order.depositTotal).toBe(60_000);
  });

  it('borongan: subtotal = total borongan (tidak dikali hari), harga baris 0, validasi konsisten', async () => {
    const { speaker, mic, create } = await setup();
    const items = [
      { productId: speaker.id, quantity: 2, unitPrice: 1 }, // diabaikan pada borongan
      { productId: mic.id, quantity: 4 },
    ];
    const res = await create({ pricingMode: 'LUMP', lumpTotal: 3_000_000, items });
    expect(res.status).toBe(201);
    const order = data<OrderDto>(res);
    expect(order).toMatchObject({
      pricingMode: 'LUMP',
      lumpTotal: 3_000_000,
      subtotal: 3_000_000,
      listSubtotal: 800_000,
    });
    expect(order.items.every((i) => i.unitPrice === 0 && i.lineTotal === 0)).toBe(true);
    expect(order.items.map((i) => i.listPrice).sort((a, b) => a - b)).toEqual([50_000, 100_000]);
    // Jumlah barang tetap tercatat (batas gudang) dan deposit tetap per unit.
    expect(order.items.map((i) => i.quantity).sort((a, b) => a - b)).toEqual([2, 4]);
    expect(order.depositTotal).toBe(60_000);

    // LUMP tanpa total, atau LINE dengan total → ditolak.
    expect(errorCode(await create({ pricingMode: 'LUMP', items }))).toBe('VALIDATION_ERROR');
    expect(errorCode(await create({ pricingMode: 'LINE', lumpTotal: 1000, items }))).toBe(
      'VALIDATION_ERROR',
    );
  });

  it('invoice menyalin total borongan; konfirmasi mengalokasikan stok seperti biasa', async () => {
    const { app, admin, speaker, create } = await setup();
    const order = data<OrderDto>(
      await create({
        pricingMode: 'LUMP',
        lumpTotal: 2_500_000,
        items: [{ productId: speaker.id, quantity: 3 }],
      }),
    );
    const post = (path: string, body: object = {}) =>
      request(app).post(`${V1}${path}`).set(auth(admin)).send(body);
    expect((await post(`/orders/${order.id}/submit`)).status).toBe(200);
    expect((await post(`/orders/${order.id}/confirm`)).status).toBe(200);
    const confirmed = data<OrderDto>(
      await request(app).get(`${V1}/orders/${order.id}`).set(auth(admin)),
    );
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.subtotal).toBe(2_500_000);

    const invoice = await post('/invoices', { orderId: order.id });
    expect(invoice.status).toBe(201);
    expect((invoice.body as { data: { rentAmount: number } }).data.rentAmount).toBe(2_500_000);
  });

  it('harga negosiasi dan borongan bertahan saat penawaran ulang; hanya draft yang dapat diubah harganya', async () => {
    const { app, admin, speaker, mic, create } = await setup();
    const post = (path: string, body: object = {}) =>
      request(app).post(`${V1}${path}`).set(auth(admin)).send(body);

    const line = data<OrderDto>(
      await create({
        items: [
          { productId: speaker.id, quantity: 1, unitPrice: 70_000 },
          { productId: mic.id, quantity: 1 },
        ],
      }),
    );
    // Harga default produk naik setelah pesanan dibuat.
    await db.product.update({ where: { id: mic.id }, data: { price: 60_000n } });
    await post(`/orders/${line.id}/submit`);
    const quoted = data<OrderDto>(await post(`/orders/${line.id}/quote`));
    const q = (name: string) => quoted.items.find((i) => i.productName === name);
    expect(q('Speaker')).toMatchObject({ unitPrice: 70_000, listPrice: 100_000 }); // negosiasi bertahan
    expect(q('Mic')).toMatchObject({ unitPrice: 60_000, listPrice: 60_000 }); // default disegarkan
    expect(quoted.subtotal).toBe((70_000 + 60_000) * 2);

    // Setelah diajukan, harga tidak bisa diubah lewat PUT.
    const put = await request(app)
      .put(`${V1}/orders/${line.id}`)
      .set(auth(admin))
      .send({
        customerId: line.customerId,
        startDate: line.startDate,
        endDate: line.endDate,
        eventLocation: line.eventLocation,
        items: [{ productId: speaker.id, quantity: 1, unitPrice: 1 }],
      });
    expect(errorCode(put)).toBe('ORDER_NOT_DRAFT');

    const lump = data<OrderDto>(
      await create({
        pricingMode: 'LUMP',
        lumpTotal: 900_000,
        items: [{ productId: speaker.id, quantity: 1 }],
      }),
    );
    await post(`/orders/${lump.id}/submit`);
    const requoted = data<OrderDto>(await post(`/orders/${lump.id}/quote`));
    expect(requoted).toMatchObject({ pricingMode: 'LUMP', subtotal: 900_000, lumpTotal: 900_000 });
  });

  it('gudang tidak menerima nominal harga (detail, daftar, dan pick list)', async () => {
    const { app, admin, speaker, create } = await setup();
    const warehouse = await loginAs(app, 'WAREHOUSE');
    const coordinator = await loginAs(app, 'OPS_COORDINATOR');
    const order = data<OrderDto>(
      await create({
        pricingMode: 'LUMP',
        lumpTotal: 4_000_000,
        items: [{ productId: speaker.id, quantity: 2 }],
      }),
    );
    await request(app).post(`${V1}/orders/${order.id}/submit`).set(auth(admin));
    await request(app).post(`${V1}/orders/${order.id}/confirm`).set(auth(admin));

    const detail = data<OrderDto>(
      await request(app).get(`${V1}/orders/${order.id}`).set(auth(warehouse)),
    );
    expect(detail).toMatchObject({
      pricesHidden: true,
      subtotal: 0,
      depositTotal: 0,
      lumpTotal: null,
      listSubtotal: 0,
    });
    expect(detail.items.every((i) => i.unitPrice === 0 && i.listPrice === 0)).toBe(true);
    expect(detail.items[0]?.quantity).toBe(2); // batas jumlah tetap terlihat
    expect(JSON.stringify(detail)).not.toContain('4000000');

    const list = await request(app).get(`${V1}/orders`).set(auth(warehouse));
    expect(JSON.stringify(list.body)).not.toContain('4000000');
    expect((list.body as { data: { items: OrderDto[] } }).data.items[0]?.pricesHidden).toBe(true);

    // Koordinator dan admin tetap melihat harga.
    const seen = data<OrderDto>(
      await request(app).get(`${V1}/orders/${order.id}`).set(auth(coordinator)),
    );
    expect(seen).toMatchObject({ pricesHidden: false, subtotal: 4_000_000 });
  });
});
