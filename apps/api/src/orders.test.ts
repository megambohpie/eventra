import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type {
  AvailabilityResultDto,
  CalendarDayDetailDto,
  CalendarDayDto,
  OrderDto,
  Role,
} from '@eventra/shared';
import { expireHolds } from './orders/service';
import { createTestApp, createUser, db, loginAs, resetDb } from '../test/helpers';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const V1 = '/api/v1';

let seq = 0;

async function seedProduct(name: string, stock: number, opts: { unitLabel?: string } = {}) {
  const category =
    (await db.category.findFirst({ where: { name: 'Umum' } })) ??
    (await db.category.create({ data: { name: 'Umum' } }));
  const product = await db.product.create({
    data: {
      name,
      categoryId: category.id,
      pricingUnit: 'PCS',
      unitLabel: opts.unitLabel ?? 'pcs',
      price: 100000n,
      deposit: 50000n,
    },
  });
  if (stock > 0) {
    await db.asset.createMany({
      data: Array.from({ length: stock }, () => {
        seq += 1;
        return {
          code: `AST-T${String(seq).padStart(6, '0')}`,
          qrToken: `tok-${seq}-aaaaaaaaaaaaaaaaaaaa`,
          productId: product.id,
        };
      }),
    });
  }
  return product;
}

const seedCustomer = (name = 'PT Acara') =>
  db.customer.create({ data: { type: 'COMPANY', name, phone: '021' } });

const orderBody = (
  customerId: string,
  items: { productId: string; quantity: number }[],
  start: string,
  end: string,
) => ({ customerId, startDate: start, endDate: end, eventLocation: 'Balai Kartini', items });

const customerPic = { role: 'CUSTOMER_PIC', source: 'CUSTOMER', name: 'Budi', phone: '0812' };

/** Pesanan lengkap sampai berstatus QUOTED (siap hold/confirm). */
async function quotedOrder(
  app: Express,
  admin: string,
  customerId: string,
  items: { productId: string; quantity: number }[],
  start: string,
  end: string,
): Promise<string> {
  const created = await request(app)
    .post(`${V1}/orders`)
    .set(auth(admin))
    .send(orderBody(customerId, items, start, end));
  expect(created.status).toBe(201);
  const id = (created.body as { data: OrderDto }).data.id;
  expect(
    (await request(app).post(`${V1}/orders/${id}/pics`).set(auth(admin)).send(customerPic)).status,
  ).toBe(201);
  const submitted = await request(app).post(`${V1}/orders/${id}/submit`).set(auth(admin));
  expect(submitted.status).toBe(200);
  const quoted = await request(app).post(`${V1}/orders/${id}/quote`).set(auth(admin)).send({});
  expect(quoted.status).toBe(200);
  return id;
}

const confirm = (app: Express, admin: string, id: string) =>
  request(app).post(`${V1}/orders/${id}/confirm`).set(auth(admin)).send({});

const errorCode = (res: request.Response) => (res.body as { error: { code: string } }).error.code;

async function check(
  app: Express,
  token: string,
  items: { productId: string; quantity: number }[],
  start: string,
  end: string,
  excludeOrderId?: string,
): Promise<AvailabilityResultDto> {
  const res = await request(app)
    .post(`${V1}/availability/check`)
    .set(auth(token))
    .send({ startDate: start, endDate: end, items, excludeOrderId });
  expect(res.status).toBe(200);
  return (res.body as { data: AvailabilityResultDto }).data;
}

describe('Fase 03 — paket, ketersediaan, pesanan', () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  it('skenario PRD: stok 30, pesanan 8–9 sebanyak 15, permintaan 7–8 maksimal 15', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const speaker = await seedProduct('Speaker', 30);
    const customer = await seedCustomer();

    // Pesanan A (1–2) 20 unit → sisa 10 pada tanggal 1 dan 2.
    const a = await quotedOrder(
      app,
      admin,
      customer.id,
      [{ productId: speaker.id, quantity: 20 }],
      '2026-12-01',
      '2026-12-02',
    );
    expect((await confirm(app, admin, a)).status).toBe(200);
    const afterA = await check(
      app,
      admin,
      [{ productId: speaker.id, quantity: 11 }],
      '2026-12-01',
      '2026-12-02',
    );
    expect(afterA.ok).toBe(false);
    expect(afterA.items[0]?.maxQuantity).toBe(10);

    // Pesanan B (8–9) 15 unit.
    const b = await quotedOrder(
      app,
      admin,
      customer.id,
      [{ productId: speaker.id, quantity: 15 }],
      '2026-12-08',
      '2026-12-09',
    );
    expect((await confirm(app, admin, b)).status).toBe(200);

    // Permintaan C 7–8: tanggal 7 sisa 30, tanggal 8 sisa 15 → maksimal 15.
    const probe = await check(
      app,
      admin,
      [{ productId: speaker.id, quantity: 30 }],
      '2026-12-07',
      '2026-12-08',
    );
    expect(probe.items[0]?.maxQuantity).toBe(15);
    expect(probe.ok).toBe(false);

    const tooMany = await quotedOrder(
      app,
      admin,
      customer.id,
      [{ productId: speaker.id, quantity: 15 }],
      '2026-12-07',
      '2026-12-08',
    );
    // C meminta 15 saat masih tersedia penuh; sekarang pesanan D 16 harus ditolak.
    const d = await request(app)
      .post(`${V1}/orders`)
      .set(auth(admin))
      .send(
        orderBody(
          customer.id,
          [{ productId: speaker.id, quantity: 16 }],
          '2026-12-07',
          '2026-12-08',
        ),
      );
    const dId = (d.body as { data: OrderDto }).data.id;
    await request(app).post(`${V1}/orders/${dId}/pics`).set(auth(admin)).send(customerPic);
    const submitD = await request(app).post(`${V1}/orders/${dId}/submit`).set(auth(admin));
    expect(submitD.status).toBe(409);
    expect(errorCode(submitD)).toBe('INSUFFICIENT_STOCK');
    expect((await confirm(app, admin, tooMany)).status).toBe(200);
  });

  it('konversi paket: 1 meter = 4 panel; pesan 4 meter memakai 16 panel', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const panel = await seedProduct('LED Panel', 16, { unitLabel: 'panel' });
    const meter = await seedProduct('LED 1 meter', 0, { unitLabel: 'meter' });
    const customer = await seedCustomer();

    const put = await request(app)
      .put(`${V1}/product-bundles/${meter.id}`)
      .set(auth(admin))
      .send({ components: [{ componentProductId: panel.id, quantity: 4 }] });
    expect(put.status).toBe(200);

    const probe = await check(
      app,
      admin,
      [{ productId: meter.id, quantity: 5 }],
      '2026-12-01',
      '2026-12-01',
    );
    expect(probe.items[0]?.maxQuantity).toBe(4);
    expect(probe.items[0]?.components[0]?.required).toBe(20);

    const id = await quotedOrder(
      app,
      admin,
      customer.id,
      [{ productId: meter.id, quantity: 4 }],
      '2026-12-01',
      '2026-12-01',
    );
    expect((await confirm(app, admin, id)).status).toBe(200);
    const rows = await db.stockAllocation.findMany({ where: { orderId: id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ productId: panel.id, quantity: 16, status: 'CONFIRMED' });

    // Panel habis: 1 meter lagi pada tanggal yang sama ditolak, juga 1 panel langsung.
    expect(
      (await check(app, admin, [{ productId: meter.id, quantity: 1 }], '2026-12-01', '2026-12-01'))
        .ok,
    ).toBe(false);
    expect(
      (await check(app, admin, [{ productId: panel.id, quantity: 1 }], '2026-12-01', '2026-12-01'))
        .ok,
    ).toBe(false);
  });

  it('paket tidak boleh bersarang atau menunjuk dirinya sendiri', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const a = await seedProduct('A', 1);
    const b = await seedProduct('B', 1);
    const c = await seedProduct('C', 1);
    const put = (productId: string, componentProductId: string) =>
      request(app)
        .put(`${V1}/product-bundles/${productId}`)
        .set(auth(admin))
        .send({ components: [{ componentProductId, quantity: 2 }] });
    expect((await put(a.id, a.id)).status).toBe(400);
    expect((await put(a.id, b.id)).status).toBe(200);
    expect(errorCode(await put(b.id, c.id))).toBe('BUNDLE_NESTED'); // b menjadi komponen
    expect(errorCode(await put(c.id, a.id))).toBe('BUNDLE_NESTED'); // a sudah berpaket
  });

  it('hold menahan stok, kadaluarsa melepasnya, dan konfirmasi hold kadaluarsa ditolak', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const tent = await seedProduct('Tenda', 10);
    const customer = await seedCustomer();
    const a = await quotedOrder(
      app,
      admin,
      customer.id,
      [{ productId: tent.id, quantity: 10 }],
      '2026-12-05',
      '2026-12-06',
    );

    const hold = await request(app)
      .post(`${V1}/orders/${a}/hold`)
      .set(auth(admin))
      .send({ holdMinutes: 30 });
    expect(hold.status).toBe(200);
    expect((hold.body as { data: OrderDto }).data.status).toBe('AWAITING_PAYMENT');
    expect(
      (await check(app, admin, [{ productId: tent.id, quantity: 1 }], '2026-12-05', '2026-12-05'))
        .items[0]?.maxQuantity,
    ).toBe(0);

    // Hold lewat waktu: stok langsung bebas walau job belum berjalan.
    const past = new Date(Date.now() - 60_000);
    await db.stockAllocation.updateMany({ where: { orderId: a }, data: { expiresAt: past } });
    await db.order.update({ where: { id: a }, data: { holdExpiresAt: past } });
    expect(
      (await check(app, admin, [{ productId: tent.id, quantity: 10 }], '2026-12-05', '2026-12-06'))
        .ok,
    ).toBe(true);

    // Konfirmasi pada hold kadaluarsa → 409 dan pesanan menjadi EXPIRED + alokasi RELEASED.
    const late = await confirm(app, admin, a);
    expect(late.status).toBe(409);
    expect(errorCode(late)).toBe('HOLD_EXPIRED');
    expect((await db.order.findUniqueOrThrow({ where: { id: a } })).status).toBe('EXPIRED');
    expect(
      await db.stockAllocation.count({ where: { orderId: a, status: { not: 'RELEASED' } } }),
    ).toBe(0);

    // Job expireHolds melepas hold lain yang kadaluarsa.
    const b = await quotedOrder(
      app,
      admin,
      customer.id,
      [{ productId: tent.id, quantity: 5 }],
      '2026-12-05',
      '2026-12-05',
    );
    await request(app).post(`${V1}/orders/${b}/hold`).set(auth(admin)).send({});
    const when = new Date(Date.now() + 2 * 3_600_000);
    expect(await expireHolds(db, when)).toBe(1);
    expect(await expireHolds(db, when)).toBe(0);
    expect((await db.order.findUniqueOrThrow({ where: { id: b } })).status).toBe('EXPIRED');
    const history = await db.orderStatusEvent.findMany({
      where: { orderId: b },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.at(-1)).toMatchObject({ fromStatus: 'AWAITING_PAYMENT', toStatus: 'EXPIRED' });
  });

  it('konfirmasi setelah hold aktif mengganti hold menjadi CONFIRMED; batal melepas stok', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const chair = await seedProduct('Kursi', 10);
    const customer = await seedCustomer();
    const a = await quotedOrder(
      app,
      admin,
      customer.id,
      [{ productId: chair.id, quantity: 10 }],
      '2026-12-05',
      '2026-12-05',
    );
    await request(app).post(`${V1}/orders/${a}/hold`).set(auth(admin)).send({});
    expect((await confirm(app, admin, a)).status).toBe(200);
    const rows = await db.stockAllocation.findMany({
      where: { orderId: a },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((r) => r.status).sort()).toEqual(['CONFIRMED', 'RELEASED']);

    // Konfirmasi ulang ditolak (status bukan QUOTED/AWAITING_PAYMENT).
    expect(errorCode(await confirm(app, admin, a))).toBe('INVALID_ORDER_STATE');

    expect(
      (await check(app, admin, [{ productId: chair.id, quantity: 1 }], '2026-12-05', '2026-12-05'))
        .ok,
    ).toBe(false);
    const cancel = await request(app)
      .post(`${V1}/orders/${a}/cancel`)
      .set(auth(admin))
      .send({ note: 'batal' });
    expect(cancel.status).toBe(200);
    expect(
      (await check(app, admin, [{ productId: chair.id, quantity: 10 }], '2026-12-05', '2026-12-05'))
        .ok,
    ).toBe(true);
    // Alokasi tidak dihapus: tetap sebagai riwayat RELEASED.
    expect(await db.stockAllocation.count({ where: { orderId: a, status: 'RELEASED' } })).toBe(2);
  });

  it('konkurensi: konfirmasi serentak tidak pernah overbooking', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const speaker = await seedProduct('Speaker', 10);
    const customer = await seedCustomer();

    const ids: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      ids.push(
        await quotedOrder(
          app,
          admin,
          customer.id,
          [{ productId: speaker.id, quantity: 4 }],
          '2026-12-10',
          '2026-12-12',
        ),
      );
    }
    const results = await Promise.all(ids.map((id) => confirm(app, admin, id)));
    const ok = results.filter((r) => r.status === 200).length;
    const failed = results.filter((r) => r.status === 409);

    expect(ok).toBe(2); // 10 / 4 = 2 pesanan
    expect(failed).toHaveLength(4);
    expect(failed.every((r) => errorCode(r) === 'INSUFFICIENT_STOCK')).toBe(true);

    const perDate = await db.stockAllocation.groupBy({
      by: ['date'],
      where: { status: 'CONFIRMED' },
      _sum: { quantity: true },
    });
    expect(perDate).toHaveLength(3);
    for (const row of perDate) expect(row._sum.quantity).toBe(8);
  });

  it('konfirmasi ganda pesanan yang sama hanya berhasil satu kali', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const speaker = await seedProduct('Speaker', 10);
    const customer = await seedCustomer();
    const id = await quotedOrder(
      app,
      admin,
      customer.id,
      [{ productId: speaker.id, quantity: 3 }],
      '2026-12-10',
      '2026-12-10',
    );
    const results = await Promise.all([
      confirm(app, admin, id),
      confirm(app, admin, id),
      confirm(app, admin, id),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await db.stockAllocation.count({ where: { orderId: id, status: 'CONFIRMED' } })).toBe(1);
  });

  it('aset servis/karantina/pensiun tidak dihitung sebagai stok', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const speaker = await seedProduct('Speaker', 5);
    await db.asset.updateMany({
      where: { productId: speaker.id },
      data: { status: 'QUARANTINED' },
    });
    const first = await db.asset.findFirstOrThrow({ where: { productId: speaker.id } });
    await db.asset.update({ where: { id: first.id }, data: { status: 'AVAILABLE' } });
    const probe = await check(
      app,
      admin,
      [{ productId: speaker.id, quantity: 5 }],
      '2026-12-01',
      '2026-12-01',
    );
    expect(probe.items[0]?.maxQuantity).toBe(1);
  });

  it('aturan PIC: wajib PIC penyewa, gudang internal, pihak ketiga perlu otorisasi, jadwal butuh PIC lengkap', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const speaker = await seedProduct('Speaker', 10);
    const customer = await seedCustomer();
    const warehouseUser = await createUser('WAREHOUSE');
    const created = await request(app)
      .post(`${V1}/orders`)
      .set(auth(admin))
      .send(
        orderBody(
          customer.id,
          [{ productId: speaker.id, quantity: 2 }],
          '2026-12-01',
          '2026-12-01',
        ),
      );
    const id = (created.body as { data: OrderDto }).data.id;
    const pics = (body: object) =>
      request(app).post(`${V1}/orders/${id}/pics`).set(auth(admin)).send(body);

    // Tanpa PIC penyewa tidak bisa diajukan.
    const noPic = await request(app).post(`${V1}/orders/${id}/submit`).set(auth(admin));
    expect(noPic.status).toBe(409);
    expect(errorCode(noPic)).toBe('PIC_REQUIRED');

    // PIC gudang harus pengguna internal; pihak ketiga wajib otorisasi.
    expect(
      (await pics({ role: 'WAREHOUSE_OUT', source: 'CUSTOMER', name: 'X', phone: '0811' })).status,
    ).toBe(400);
    expect(
      (
        await pics({
          role: 'FIELD',
          source: 'THIRD_PARTY',
          name: 'Vendor',
          phone: '0811',
          organization: 'CV A',
        })
      ).status,
    ).toBe(400);
    const third = await pics({
      role: 'FIELD',
      source: 'THIRD_PARTY',
      name: 'Vendor',
      phone: '0811',
      organization: 'CV A',
      authorization: 'Surat gudang 12/XI',
    });
    expect(third.status).toBe(201);
    const thirdPic = (third.body as { data: { source: string; approvedBy: string | null }[] })
      .data[0];
    expect(thirdPic?.approvedBy).toBeTruthy();
    // Satu PIC lapangan per pesanan.
    expect(
      errorCode(await pics({ role: 'FIELD', source: 'CUSTOMER', name: 'Y', phone: '0822' })),
    ).toBe('PIC_ROLE_TAKEN');
    // Pengguna non-gudang tidak boleh menjadi PIC gudang.
    const customerRole = await createUser('CUSTOMER', 'cust@test.local');
    expect(
      (await pics({ role: 'WAREHOUSE_OUT', source: 'OWNER', userId: customerRole.id })).status,
    ).toBe(400);

    expect((await pics(customerPic)).status).toBe(201);
    expect((await request(app).post(`${V1}/orders/${id}/submit`).set(auth(admin))).status).toBe(
      200,
    );
    await request(app).post(`${V1}/orders/${id}/quote`).set(auth(admin)).send({});
    expect((await confirm(app, admin, id)).status).toBe(200);

    // Jadwal ditolak sampai PIC gudang keluar/kembali lengkap.
    const early = await request(app).post(`${V1}/orders/${id}/schedule`).set(auth(admin));
    expect(early.status).toBe(409);
    expect(errorCode(early)).toBe('PIC_REQUIRED');
    expect(
      (await pics({ role: 'WAREHOUSE_OUT', source: 'OWNER', userId: warehouseUser.id })).status,
    ).toBe(201);
    expect(
      (await pics({ role: 'WAREHOUSE_IN', source: 'OWNER', userId: warehouseUser.id })).status,
    ).toBe(201);
    const scheduled = await request(app).post(`${V1}/orders/${id}/schedule`).set(auth(admin));
    expect(scheduled.status).toBe(200);
    expect((scheduled.body as { data: OrderDto }).data.status).toBe('SCHEDULED');

    // PIC penyewa terakhir tidak boleh dihapus setelah pesanan diajukan.
    const detail = (await request(app).get(`${V1}/orders/${id}`).set(auth(admin))).body as {
      data: OrderDto;
    };
    const customerPicId = detail.data.pics.find((p) => p.role === 'CUSTOMER_PIC')?.id;
    const del = await request(app)
      .delete(`${V1}/orders/${id}/pics/${customerPicId}`)
      .set(auth(admin));
    expect(del.status).toBe(409);
    expect(errorCode(del)).toBe('PIC_REQUIRED');
  });

  it('draft dapat diubah; setelah diajukan tidak; penawaran membuat versi baru dan riwayat tercatat', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const speaker = await seedProduct('Speaker', 10);
    const customer = await seedCustomer();
    const created = await request(app)
      .post(`${V1}/orders`)
      .set(auth(admin))
      .send(
        orderBody(
          customer.id,
          [{ productId: speaker.id, quantity: 2 }],
          '2026-12-01',
          '2026-12-02',
        ),
      );
    const order = (created.body as { data: OrderDto }).data;
    // 100.000 × 2 unit × 2 hari; deposit 50.000 × 2.
    expect(order).toMatchObject({
      number: expect.stringMatching(/^ORD-2026-\d{6}$/) as string,
      subtotal: 400000,
      depositTotal: 100000,
      days: 2,
    });

    const edit = await request(app)
      .put(`${V1}/orders/${order.id}`)
      .set(auth(admin))
      .send(
        orderBody(
          customer.id,
          [{ productId: speaker.id, quantity: 3 }],
          '2026-12-01',
          '2026-12-01',
        ),
      );
    expect((edit.body as { data: OrderDto }).data.subtotal).toBe(300000);

    await request(app).post(`${V1}/orders/${order.id}/pics`).set(auth(admin)).send(customerPic);
    await request(app).post(`${V1}/orders/${order.id}/submit`).set(auth(admin));
    const locked = await request(app)
      .put(`${V1}/orders/${order.id}`)
      .set(auth(admin))
      .send(
        orderBody(
          customer.id,
          [{ productId: speaker.id, quantity: 1 }],
          '2026-12-01',
          '2026-12-01',
        ),
      );
    expect(errorCode(locked)).toBe('ORDER_NOT_DRAFT');

    // Harga produk berubah → penawaran ulang mengambil harga baru sebagai versi 2.
    await request(app).post(`${V1}/orders/${order.id}/quote`).set(auth(admin)).send({});
    await db.product.update({ where: { id: speaker.id }, data: { price: 200000n } });
    const second = await request(app)
      .post(`${V1}/orders/${order.id}/quote`)
      .set(auth(admin))
      .send({ note: 'revisi' });
    const dto = (second.body as { data: OrderDto }).data;
    expect(dto.quotes.map((q) => q.version)).toEqual([2, 1]);
    expect(dto.subtotal).toBe(600000);
    expect(dto.history.map((h) => h.toStatus)).toEqual([
      'DRAFT',
      'PENDING_REVIEW',
      'QUOTED',
      'QUOTED',
    ]);
    expect(dto.history.every((h) => h.actor)).toBe(true);

    expect(
      await db.auditLog.count({ where: { entity: 'order', entityId: order.id } }),
    ).toBeGreaterThanOrEqual(5);
  });

  it('RBAC: owner baca saja, koordinator tidak dapat menyetujui, gudang tidak dapat membuat', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const speaker = await seedProduct('Speaker', 10);
    const customer = await seedCustomer();
    const id = await quotedOrder(
      app,
      admin,
      customer.id,
      [{ productId: speaker.id, quantity: 1 }],
      '2026-12-01',
      '2026-12-01',
    );
    const body = orderBody(
      customer.id,
      [{ productId: speaker.id, quantity: 1 }],
      '2026-12-02',
      '2026-12-02',
    );

    const tokens: Record<string, string> = {};
    for (const role of ['OWNER', 'OPS_COORDINATOR', 'WAREHOUSE', 'FIELD_PIC'] as Role[]) {
      tokens[role] = await loginAs(app, role);
    }
    expect(
      (
        await request(app)
          .get(`${V1}/orders`)
          .set(auth(tokens.OWNER as string))
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .get(`${V1}/orders/${id}`)
          .set(auth(tokens.WAREHOUSE as string))
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .get(`${V1}/orders`)
          .set(auth(tokens.FIELD_PIC as string))
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`${V1}/orders`)
          .set(auth(tokens.OWNER as string))
          .send(body)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`${V1}/orders`)
          .set(auth(tokens.WAREHOUSE as string))
          .send(body)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`${V1}/orders`)
          .set(auth(tokens.OPS_COORDINATOR as string))
          .send(body)
      ).status,
    ).toBe(201);
    expect((await confirm(app, tokens.OPS_COORDINATOR as string, id)).status).toBe(403);
    expect(
      (
        await request(app)
          .post(`${V1}/orders/${id}/quote`)
          .set(auth(tokens.OPS_COORDINATOR as string))
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .put(`${V1}/product-bundles/${speaker.id}`)
          .set(auth(tokens.OPS_COORDINATOR as string))
          .send({ components: [] })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`${V1}/availability/check`)
          .set(auth(tokens.FIELD_PIC as string))
          .send({})
      ).status,
    ).toBe(403);

    // Koordinator tidak boleh membatalkan pesanan yang sudah menahan stok.
    expect((await confirm(app, admin, id)).status).toBe(200);
    expect(
      (
        await request(app)
          .post(`${V1}/orders/${id}/cancel`)
          .set(auth(tokens.OPS_COORDINATOR as string))
          .send({})
      ).status,
    ).toBe(403);
  });

  it('validasi: rentang tanggal, produk duplikat, pelanggan nonaktif', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const speaker = await seedProduct('Speaker', 10);
    const customer = await seedCustomer();
    const post = (body: object) => request(app).post(`${V1}/orders`).set(auth(admin)).send(body);
    const item = { productId: speaker.id, quantity: 1 };
    expect((await post(orderBody(customer.id, [item], '2026-12-05', '2026-12-01'))).status).toBe(
      400,
    );
    expect((await post(orderBody(customer.id, [item], '2026-01-01', '2026-12-31'))).status).toBe(
      400,
    );
    expect(
      (await post(orderBody(customer.id, [item, item], '2026-12-01', '2026-12-01'))).status,
    ).toBe(400);
    expect(
      (await post(orderBody(customer.id, [{ ...item, quantity: 0 }], '2026-12-01', '2026-12-01')))
        .status,
    ).toBe(400);
    await db.customer.update({ where: { id: customer.id }, data: { active: false } });
    expect(errorCode(await post(orderBody(customer.id, [item], '2026-12-01', '2026-12-01')))).toBe(
      'CUSTOMER_INACTIVE',
    );
  });

  it('kalender: keluar pada tanggal mulai, kembali pada tanggal selesai, dengan rincian', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const panel = await seedProduct('LED Panel', 16);
    const meter = await seedProduct('LED 1 meter', 0, { unitLabel: 'meter' });
    const speaker = await seedProduct('Speaker', 10);
    const customer = await seedCustomer('PT Acara Megah');
    await request(app)
      .put(`${V1}/product-bundles/${meter.id}`)
      .set(auth(admin))
      .send({ components: [{ componentProductId: panel.id, quantity: 4 }] });

    const a = await quotedOrder(
      app,
      admin,
      customer.id,
      [
        { productId: meter.id, quantity: 2 },
        { productId: speaker.id, quantity: 3 },
      ],
      '2026-12-03',
      '2026-12-05',
    );
    const pending = await quotedOrder(
      app,
      admin,
      customer.id,
      [{ productId: speaker.id, quantity: 1 }],
      '2026-12-03',
      '2026-12-03',
    );
    expect((await confirm(app, admin, a)).status).toBe(200);

    const month = await request(app)
      .get(`${V1}/calendar?from=2026-12-01&to=2026-12-31`)
      .set(auth(admin));
    const days = (month.body as { data: CalendarDayDto[] }).data;
    expect(days).toHaveLength(31);
    expect(days.find((d) => d.date === '2026-12-03')).toMatchObject({
      outgoingOrders: 1,
      outgoingUnits: 11,
    });
    expect(days.find((d) => d.date === '2026-12-05')).toMatchObject({
      returningOrders: 1,
      returningUnits: 11,
    });
    expect(days.find((d) => d.date === '2026-12-04')).toMatchObject({
      outgoingOrders: 0,
      returningOrders: 0,
    });

    const day = await request(app).get(`${V1}/calendar/day?date=2026-12-03`).set(auth(admin));
    const detail = (day.body as { data: CalendarDayDetailDto }).data;
    expect(detail.outgoing).toHaveLength(1); // pesanan yang belum dikonfirmasi tidak tampil
    expect(detail.returning).toHaveLength(0);
    expect(detail.outgoing[0]).toMatchObject({
      orderId: a,
      customerName: 'PT Acara Megah',
      eventLocation: 'Balai Kartini',
    });
    expect(detail.outgoing[0]?.units).toEqual(
      expect.arrayContaining([
        { productName: 'LED Panel', quantity: 8 },
        { productName: 'Speaker', quantity: 3 },
      ]),
    );
    expect(detail.outgoing[0]?.pics[0]).toMatchObject({ role: 'CUSTOMER_PIC', name: 'Budi' });
    expect(pending).toBeTruthy();

    // Kalender ketersediaan harian per produk fisik.
    const stock = await request(app)
      .get(`${V1}/availability/calendar?from=2026-12-03&to=2026-12-04&productId=${meter.id}`)
      .set(auth(admin));
    const rows = (
      stock.body as {
        data: {
          date: string;
          productName: string;
          total: number;
          confirmed: number;
          remaining: number;
        }[];
      }
    ).data;
    expect(rows).toEqual([
      expect.objectContaining({
        date: '2026-12-03',
        productName: 'LED Panel',
        total: 16,
        confirmed: 8,
        remaining: 8,
      }),
      expect.objectContaining({
        date: '2026-12-04',
        productName: 'LED Panel',
        total: 16,
        confirmed: 8,
        remaining: 8,
      }),
    ]);
  });
});
