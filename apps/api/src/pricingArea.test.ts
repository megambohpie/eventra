import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { OrderDto, ProductDto } from '@eventra/shared';
import { createTestApp, db, loginAs, resetDb } from '../test/helpers';

const V1 = '/api/v1';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const errorCode = (res: request.Response) => (res.body as { error: { code: string } }).error.code;
const data = <T>(res: request.Response) => (res.body as { data: T }).data;

describe('Harga per m² (tarif × luas kabinet) dengan aksesori include berharga 0', () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  it('validasi: per m² wajib ukuran; harga unit dihitung dari tarif × luas', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const category = await db.category.create({ data: { name: 'LED' } });
    const body = (extra: object) => ({
      name: 'Kabinet',
      categoryId: category.id,
      pricingUnit: 'AREA',
      unitLabel: 'kabinet',
      price: 500_000,
      deposit: 0,
      ...extra,
    });
    const post = (b: object) => request(app).post(`${V1}/products`).set(auth(admin)).send(b);

    const noSize = await post(body({}));
    expect(noSize.status).toBe(400);
    expect((await post(body({ widthCm: 100 }))).status).toBe(400);

    const big = data<ProductDto>(await post(body({ widthCm: 100, heightCm: 50 })));
    expect(big).toMatchObject({ pricingUnit: 'AREA', price: 500_000, unitPrice: 250_000 });
    const small = data<ProductDto>(await post(body({ name: 'K2', widthCm: 50, heightCm: 50 })));
    expect(small.unitPrice).toBe(125_000);

    // Produk per pcs tidak terpengaruh ukuran.
    const pcs = data<ProductDto>(
      await post(
        body({ name: 'Speaker', pricingUnit: 'PCS', price: 90_000, widthCm: 30, heightCm: 30 }),
      ),
    );
    expect(pcs.unitPrice).toBe(90_000);

    // Ganti tarif sekali: harga semua ukuran ikut berubah.
    const updated = await request(app)
      .put(`${V1}/products/${big.id}`)
      .set(auth(admin))
      .send(body({ widthCm: 100, heightCm: 50, price: 600_000 }));
    expect(data<ProductDto>(updated).unitPrice).toBe(300_000);
    expect(
      errorCode(await post(body({ name: 'X', pricingUnit: 'METER', widthCm: 1, heightCm: 1 }))),
    ).toBe('VALIDATION_ERROR');
  });

  it('pesanan videotron campuran: total = tarif × luas × hari; aksesori include tidak menambah harga', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const category = await db.category.create({ data: { name: 'LED' } });
    const customer = await db.customer.create({
      data: { type: 'COMPANY', name: 'PT Acara', phone: '021' },
    });
    const make = async (extra: object) =>
      data<ProductDto>(
        await request(app)
          .post(`${V1}/products`)
          .set(auth(admin))
          .send({
            categoryId: category.id,
            pricingUnit: 'PCS',
            unitLabel: 'pcs',
            price: 0,
            deposit: 0,
            ...extra,
          }),
      );
    const big = await make({
      name: 'LED 100x50',
      pricingUnit: 'AREA',
      price: 500_000,
      widthCm: 100,
      heightCm: 50,
    });
    const small = await make({
      name: 'LED 50x50',
      pricingUnit: 'AREA',
      price: 500_000,
      widthCm: 50,
      heightCm: 50,
    });
    const cable = await make({ name: 'Kabel jumper', stockMode: 'UNLIMITED' });
    const pole = await make({ name: 'Tiang sangga' });
    let n = 0;
    for (const [product, count] of [
      [big, 8],
      [small, 4],
      [pole, 6],
    ] as const) {
      for (let i = 0; i < count; i += 1) {
        n += 1;
        await db.asset.create({
          data: {
            code: `AST-P${String(n).padStart(5, '0')}`,
            qrToken: `qr-price-${String(n).padStart(4, '0')}-xxxxxxxx`,
            productId: product.id,
          },
        });
      }
    }

    const res = await request(app)
      .post(`${V1}/orders`)
      .set(auth(admin))
      .send({
        customerId: customer.id,
        startDate: '2027-03-08',
        endDate: '2027-03-09', // 2 hari
        eventLocation: 'Balai Kartini',
        items: [
          { productId: big.id, quantity: 8 }, // 4 m²
          { productId: small.id, quantity: 4 }, // 1 m²
          { productId: cable.id, quantity: 30 }, // include, jumlah sesuai kondisi lapangan
          { productId: pole.id, quantity: 6 },
        ],
      });
    expect(res.status).toBe(201);
    const order = data<OrderDto>(res);
    // 5 m² × Rp 500.000 × 2 hari = Rp 5.000.000
    expect(order.subtotal).toBe(5_000_000);
    const price = (name: string) => order.items.find((i) => i.productName === name)?.unitPrice;
    expect(price('LED 100x50')).toBe(250_000);
    expect(price('LED 50x50')).toBe(125_000);
    expect(price('Kabel jumper')).toBe(0);
    expect(price('Tiang sangga')).toBe(0);

    // Tarif berubah setelahnya: harga pesanan yang sudah dibuat tetap (snapshot).
    await db.product.update({ where: { id: big.id }, data: { price: 900_000n } });
    const again = data<OrderDto>(
      await request(app).get(`${V1}/orders/${order.id}`).set(auth(admin)),
    );
    expect(again.subtotal).toBe(5_000_000);
    expect(again.items.find((i) => i.productName === 'LED 100x50')?.unitPrice).toBe(250_000);
  });
});
