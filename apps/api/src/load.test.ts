import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { AvailabilityResultDto, OrderDto } from '@eventra/shared';
import { newQrToken } from './assets/service';
import { createTestApp, db, loginAs, resetDb } from '../test/helpers';

/**
 * Uji beban: konfirmasi pesanan dan cek ketersediaan serentak. Invarian yang dibuktikan di bawah
 * beban: tidak ada overbooking, tidak ada deadlock/5xx, dan latensi tetap wajar.
 * Skala dapat dinaikkan lewat LOAD_FACTOR (mis. LOAD_FACTOR=3 pnpm --filter @eventra/api test load).
 */
const FACTOR = Math.max(1, Number(process.env.LOAD_FACTOR ?? 1));
const V1 = '/api/v1';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const errorCode = (res: request.Response) => (res.body as { error: { code: string } }).error.code;

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
  await db.asset.createMany({
    data: Array.from({ length: stock }, () => ({
      code: `AST-${newQrToken().slice(0, 10).toUpperCase()}`,
      qrToken: newQrToken(),
      productId: product.id,
    })),
  });
  return product;
}

async function quotedOrder(
  app: Express,
  admin: string,
  customerId: string,
  items: { productId: string; quantity: number }[],
  start: string,
  end: string,
): Promise<string> {
  const post = (path: string, body: object = {}) =>
    request(app).post(`${V1}${path}`).set(auth(admin)).send(body);
  const created = await post('/orders', {
    customerId,
    startDate: start,
    endDate: end,
    eventLocation: 'Balai Kartini',
    items,
  });
  expect(created.status).toBe(201);
  const id = (created.body as { data: OrderDto }).data.id;
  await post(`/orders/${id}/pics`, {
    role: 'CUSTOMER_PIC',
    source: 'CUSTOMER',
    name: 'Budi',
    phone: '0812',
  });
  expect((await post(`/orders/${id}/submit`)).status).toBe(200);
  expect((await post(`/orders/${id}/quote`)).status).toBe(200);
  return id;
}

/** Jalankan tugas dengan konkurensi dibatasi; kembalikan hasil + latensi (ms). */
async function timed<T>(fns: (() => Promise<T>)[]): Promise<{ results: T[]; ms: number[] }> {
  const ms: number[] = [];
  const results = await Promise.all(
    fns.map(async (fn) => {
      const t = performance.now();
      const r = await fn();
      ms.push(performance.now() - t);
      return r;
    }),
  );
  return { results, ms: ms.sort((a, b) => a - b) };
}

const pct = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
const summary = (label: string, ms: number[]) =>
  console.info(
    `[load] ${label}: n=${ms.length} p50=${pct(ms, 50).toFixed(0)}ms p95=${pct(ms, 95).toFixed(0)}ms max=${pct(ms, 100).toFixed(0)}ms`,
  );

describe('Fase 08 — uji beban', () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  it('konfirmasi serentak pada stok yang sama: pemenang tepat sebanyak kapasitas, tanpa 5xx', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const speaker = await seedProduct('Speaker', 20);
    const customer = await db.customer.create({ data: { type: 'COMPANY', name: 'PT Beban' } });
    const n = 30 * FACTOR;

    const ids: string[] = [];
    for (let i = 0; i < n; i += 1) {
      ids.push(
        await quotedOrder(
          app,
          admin,
          customer.id,
          [{ productId: speaker.id, quantity: 2 }],
          '2027-05-10',
          '2027-05-12',
        ),
      );
    }
    const { results, ms } = await timed(
      ids.map(
        (id) => () => request(app).post(`${V1}/orders/${id}/confirm`).set(auth(admin)).send({}),
      ),
    );
    summary('confirm', ms);

    expect(results.filter((r) => r.status >= 500)).toHaveLength(0);
    const ok = results.filter((r) => r.status === 200);
    const rejected = results.filter((r) => r.status === 409);
    expect(ok).toHaveLength(10); // 20 unit / 2 per pesanan
    expect(rejected).toHaveLength(n - 10);
    expect(rejected.every((r) => errorCode(r) === 'INSUFFICIENT_STOCK')).toBe(true);

    const perDate = await db.stockAllocation.groupBy({
      by: ['date'],
      where: { status: 'CONFIRMED' },
      _sum: { quantity: true },
    });
    expect(perDate).toHaveLength(3);
    for (const row of perDate) expect(row._sum.quantity).toBe(20); // tepat penuh, tidak lebih
    expect(pct(ms, 95)).toBeLessThan(15_000);
  });

  it('cek ketersediaan massal bersamaan dengan konfirmasi: semua berhasil dan konsisten', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const speaker = await seedProduct('Speaker', 12);
    const customer = await db.customer.create({ data: { type: 'COMPANY', name: 'PT Beban' } });
    const orders: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      orders.push(
        await quotedOrder(
          app,
          admin,
          customer.id,
          [{ productId: speaker.id, quantity: 3 }],
          '2027-06-01',
          '2027-06-02',
        ),
      );
    }
    const checks = Array.from(
      { length: 100 * FACTOR },
      () => () =>
        request(app)
          .post(`${V1}/availability/check`)
          .set(auth(admin))
          .send({
            startDate: '2027-06-01',
            endDate: '2027-06-02',
            items: [{ productId: speaker.id, quantity: 1 }],
          }),
    );
    const confirms = orders.map(
      (id) => () => request(app).post(`${V1}/orders/${id}/confirm`).set(auth(admin)).send({}),
    );
    const mixed = [...checks, ...confirms].sort(() => Math.random() - 0.5);
    const { results, ms } = await timed(mixed);
    summary('availability+confirm', ms);

    expect(results.filter((r) => r.status >= 500)).toHaveLength(0);
    const checkRes = results.filter((r) => r.request.url.includes('/availability/check'));
    expect(checkRes.every((r) => r.status === 200)).toBe(true);
    for (const r of checkRes) {
      // Sisa stok yang dilaporkan tidak pernah di luar 0..12 (tidak negatif, tidak melebihi total).
      const max = (r.body as { data: AvailabilityResultDto }).data.items[0]?.maxQuantity ?? -1;
      expect(max).toBeGreaterThanOrEqual(0);
      expect(max).toBeLessThanOrEqual(12);
    }
    const won = results.filter((r) => r.request.url.endsWith('/confirm') && r.status === 200);
    expect(won).toHaveLength(4); // 12 / 3
    const after = await request(app)
      .post(`${V1}/availability/check`)
      .set(auth(admin))
      .send({
        startDate: '2027-06-01',
        endDate: '2027-06-02',
        items: [{ productId: speaker.id, quantity: 1 }],
      });
    expect((after.body as { data: AvailabilityResultDto }).data.items[0]?.maxQuantity).toBe(0);
    expect(pct(ms, 95)).toBeLessThan(15_000);
  });

  it('pesanan multi-produk dengan urutan item berlawanan tidak deadlock', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const a = await seedProduct('Produk A', 10);
    const b = await seedProduct('Produk B', 10);
    const customer = await db.customer.create({ data: { type: 'COMPANY', name: 'PT Beban' } });
    const ids: string[] = [];
    for (let i = 0; i < 16; i += 1) {
      const items =
        i % 2 === 0
          ? [
              { productId: a.id, quantity: 2 },
              { productId: b.id, quantity: 2 },
            ]
          : [
              { productId: b.id, quantity: 2 },
              { productId: a.id, quantity: 2 },
            ];
      ids.push(await quotedOrder(app, admin, customer.id, items, '2027-07-01', '2027-07-01'));
    }
    const { results, ms } = await timed(
      ids.map(
        (id) => () => request(app).post(`${V1}/orders/${id}/confirm`).set(auth(admin)).send({}),
      ),
    );
    summary('confirm multi-produk', ms);
    expect(results.filter((r) => r.status >= 500)).toHaveLength(0);
    expect(results.filter((r) => r.status === 200)).toHaveLength(5); // 10 / 2
    const perProduct = await db.stockAllocation.groupBy({
      by: ['productId'],
      where: { status: 'CONFIRMED' },
      _sum: { quantity: true },
    });
    for (const row of perProduct) expect(row._sum.quantity).toBe(10);
  });
});
