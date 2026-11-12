import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type {
  AssetMetricsDto,
  InvoiceDto,
  NotificationListDto,
  OwnerDashboardDto,
  ReceivablesReportDto,
  RevenueReportDto,
} from '@eventra/shared';
import { createTestApp, db, loginAs, resetDb } from '../test/helpers';
import { sendDueReminders } from './finance/service';

const V1 = '/api/v1';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const data = <T>(res: request.Response) => (res.body as { data: T }).data;
const errorCode = (res: request.Response) => (res.body as { error: { code: string } }).error.code;

interface Ctx {
  app: Express;
  admin: string;
  owner: string;
  coordinator: string;
  warehouse: string;
  customerId: string;
}

let seq = 0;

async function setup(): Promise<Ctx> {
  const { app } = createTestApp();
  const customer = await db.customer.create({ data: { type: 'COMPANY', name: 'PT Acara' } });
  return {
    app,
    admin: await loginAs(app, 'ADMIN'),
    owner: await loginAs(app, 'OWNER'),
    coordinator: await loginAs(app, 'OPS_COORDINATOR'),
    warehouse: await loginAs(app, 'WAREHOUSE'),
    customerId: customer.id,
  };
}

const post = (c: Ctx, token: string, path: string, body: object = {}) =>
  request(c.app).post(`${V1}${path}`).set(auth(token)).send(body);
const get = (c: Ctx, token: string, path: string) =>
  request(c.app).get(`${V1}${path}`).set(auth(token));

/** Pesanan langsung berstatus tertentu (alur pemesanan sudah diuji di orders.test). */
async function seedOrder(
  c: Ctx,
  status: 'DRAFT' | 'CONFIRMED' = 'CONFIRMED',
  subtotal = 1_000_000n,
  deposit = 200_000n,
  start = '2027-06-10',
) {
  seq += 1;
  return db.order.create({
    data: {
      number: `ORD-2027-F${String(seq).padStart(5, '0')}`,
      customerId: c.customerId,
      status,
      startDate: new Date(`${start}T00:00:00Z`),
      endDate: new Date(`${start}T00:00:00Z`),
      eventLocation: 'Balai Kartini',
      subtotal,
      depositTotal: deposit,
    },
  });
}

async function invoiceFor(c: Ctx, orderId: string, dueDate?: string) {
  const res = await post(c, c.admin, '/invoices', { orderId, dueDate });
  expect(res.status).toBe(201);
  return data<InvoiceDto>(res);
}

const pay = (c: Ctx, invoiceId: string, body: object) =>
  post(c, c.admin, `/invoices/${invoiceId}/payments`, body);

const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeEach(resetDb);
afterAll(() => db.$disconnect());

describe('RBAC keuangan', () => {
  it('owner punya akses penuh, gudang ditolak, koordinator hanya dashboard', async () => {
    const c = await setup();
    const order = await seedOrder(c);
    expect((await post(c, c.coordinator, '/invoices', { orderId: order.id })).status).toBe(403);
    expect((await get(c, c.owner, '/invoices')).status).toBe(200);
    expect((await get(c, c.owner, '/reports/receivables')).status).toBe(200);
    expect((await get(c, c.warehouse, '/invoices')).status).toBe(403);
    expect((await get(c, c.warehouse, '/dashboards/owner')).status).toBe(403);
    expect(
      (await get(c, c.coordinator, '/reports/revenue?from=2027-01-01&to=2027-01-31')).status,
    ).toBe(403);
    expect((await get(c, c.coordinator, '/dashboards/owner')).status).toBe(200);
    expect((await post(c, c.coordinator, '/invoices/x/payments', {})).status).toBe(403);
  });
});

describe('invoice dan pembayaran', () => {
  it('hanya pesanan yang menahan stok yang dapat ditagih; satu invoice aktif per pesanan', async () => {
    const c = await setup();
    const draft = await seedOrder(c, 'DRAFT');
    const res = await post(c, c.admin, '/invoices', { orderId: draft.id });
    expect(res.status).toBe(409);
    expect(errorCode(res)).toBe('ORDER_NOT_INVOICEABLE');

    const order = await seedOrder(c);
    const inv = await invoiceFor(c, order.id);
    expect(inv.number).toMatch(/^INV-\d{4}-\d{6}$/);
    expect(inv).toMatchObject({
      rentAmount: 1_000_000,
      depositAmount: 200_000,
      total: 1_200_000,
      outstanding: 1_200_000,
      dueDate: '2027-06-10',
      paymentState: 'UNPAID',
    });
    const dup = await post(c, c.admin, '/invoices', { orderId: order.id });
    expect(errorCode(dup)).toBe('INVOICE_EXISTS');
  });

  it('pembayaran sebagian, batas bayar, gateway pending, konfirmasi, dan void', async () => {
    const c = await setup();
    const order = await seedOrder(c);
    const inv = await invoiceFor(c, order.id, '2099-01-01');

    // Transfer wajib punya referensi.
    expect(
      (await pay(c, inv.id, { purpose: 'RENT', method: 'BANK_TRANSFER', amount: 1000 })).status,
    ).toBe(400);
    const partial = data<InvoiceDto>(
      await pay(c, inv.id, { purpose: 'RENT', method: 'CASH', amount: 400_000 }),
    );
    expect(partial).toMatchObject({ paymentState: 'PARTIAL', paid: 400_000, outstanding: 800_000 });

    const over = await pay(c, inv.id, { purpose: 'RENT', method: 'CASH', amount: 700_000 });
    expect(over.status).toBe(409);
    expect(errorCode(over)).toBe('OVERPAYMENT');

    // Gateway: PENDING belum menjadi pendapatan/mengurangi piutang, tetapi menahan batas bayar.
    const pending = data<InvoiceDto>(
      await pay(c, inv.id, {
        purpose: 'DEPOSIT',
        method: 'GATEWAY',
        amount: 200_000,
        reference: 'GW-1',
      }),
    );
    expect(pending.outstandingDeposit).toBe(200_000);
    expect(pending.payableDeposit).toBe(0);
    const gwPayment = pending.payments.find((p) => p.method === 'GATEWAY');
    expect(gwPayment?.status).toBe('PENDING');
    const rev = data<RevenueReportDto>(
      await get(c, c.admin, `/reports/revenue?from=${daysFromNow(-1)}&to=${daysFromNow(1)}`),
    );
    expect(rev.depositReceived).toBe(0);

    const confirmed = await post(c, c.admin, `/payments/${gwPayment?.id}/confirm`);
    expect(confirmed.status).toBe(200);
    expect(data<InvoiceDto>(confirmed).outstandingDeposit).toBe(0);
    expect((await post(c, c.admin, `/payments/${gwPayment?.id}/confirm`)).status).toBe(409);

    // Lunasi sewa lalu void pembayaran keliru: piutang kembali.
    const done = data<InvoiceDto>(
      await pay(c, inv.id, { purpose: 'RENT', method: 'CASH', amount: 600_000 }),
    );
    expect(done.paymentState).toBe('PAID');
    const lastId = done.payments.at(-1)?.id;
    const voided = await post(c, c.admin, `/payments/${lastId}/void`, { reason: 'Salah input' });
    expect(data<InvoiceDto>(voided)).toMatchObject({
      paymentState: 'PARTIAL',
      outstanding: 600_000,
    });
    expect((await post(c, c.admin, `/payments/${lastId}/void`, { reason: 'Lagi' })).status).toBe(
      409,
    );

    // Invoice dengan pembayaran aktif tidak boleh dibatalkan.
    const voidInv = await post(c, c.admin, `/invoices/${inv.id}/void`, { reason: 'Salah nominal' });
    expect(errorCode(voidInv)).toBe('INVOICE_HAS_PAYMENTS');
  });

  it('pembayaran serentak tidak melebihi tagihan', async () => {
    const c = await setup();
    const inv = await invoiceFor(c, (await seedOrder(c)).id, '2099-01-01');
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        pay(c, inv.id, { purpose: 'RENT', method: 'CASH', amount: 600_000 }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    const after = data<InvoiceDto>(await get(c, c.admin, `/invoices/${inv.id}`));
    expect(after.paid).toBe(600_000);
  });

  it('baris pembayaran dan invoice dilindungi trigger database', async () => {
    const c = await setup();
    const inv = await invoiceFor(c, (await seedOrder(c)).id, '2099-01-01');
    const paid = data<InvoiceDto>(
      await pay(c, inv.id, { purpose: 'RENT', method: 'CASH', amount: 100_000 }),
    );
    const id = paid.payments[0]?.id ?? '';
    await expect(db.payment.delete({ where: { id } })).rejects.toThrow();
    await expect(db.payment.update({ where: { id }, data: { amount: 1n } })).rejects.toThrow();
    await expect(db.invoice.delete({ where: { id: inv.id } })).rejects.toThrow();
    await expect(
      db.invoice.update({ where: { id: inv.id }, data: { rentAmount: 5n } }),
    ).rejects.toThrow();
    await post(c, c.admin, `/payments/${id}/void`, { reason: 'Koreksi' });
    // Void membuka kembali penerbitan ulang setelah invoice dibatalkan.
    expect((await post(c, c.admin, `/invoices/${inv.id}/void`, { reason: 'Ulang' })).status).toBe(
      200,
    );
    expect((await post(c, c.admin, '/invoices', { orderId: inv.orderId })).status).toBe(201);
  });
});

describe('laporan', () => {
  it('pendapatan hanya pembayaran sewa diterima; piutang = sisa tagihan aktual', async () => {
    const c = await setup();
    const a = await invoiceFor(c, (await seedOrder(c)).id, '2099-01-01');
    const b = await invoiceFor(c, (await seedOrder(c, 'CONFIRMED', 500_000n, 0n)).id, '2000-01-01');
    await pay(c, a.id, { purpose: 'RENT', method: 'CASH', amount: 400_000 });
    await pay(c, a.id, { purpose: 'DEPOSIT', method: 'CASH', amount: 200_000 });
    // Invoice b jatuh tempo lampau dan dibayar hari ini => pembayaran terlambat.
    await pay(c, b.id, {
      purpose: 'RENT',
      method: 'BANK_TRANSFER',
      amount: 100_000,
      reference: 'TRF-1',
    });

    const rev = data<RevenueReportDto>(
      await get(
        c,
        c.admin,
        `/reports/revenue?from=${daysFromNow(-2)}&to=${daysFromNow(2)}&groupBy=month`,
      ),
    );
    expect(rev.rentReceived).toBe(500_000);
    expect(rev.depositReceived).toBe(200_000);
    expect(rev.latePayments).toBe(1);
    expect(rev.latePaymentsAmount).toBe(100_000);
    expect(rev.series.reduce((n, p) => n + p.rentReceived, 0)).toBe(500_000);

    const rec = data<ReceivablesReportDto>(await get(c, c.owner, '/reports/receivables'));
    expect(rec.summary).toMatchObject({
      invoices: 2,
      totalOutstanding: 600_000 + 400_000,
      rentOutstanding: 600_000 + 400_000,
      depositOutstanding: 0,
      overdueInvoices: 1,
      overdueOutstanding: 400_000,
      activeOrders: 2,
      activeOrderValue: 1_500_000,
    });
    expect(rec.items[0]).toMatchObject({ id: b.id, paymentState: 'OVERDUE', outstanding: 400_000 });

    // Pembayaran di luar rentang tidak masuk.
    const empty = data<RevenueReportDto>(
      await get(c, c.admin, '/reports/revenue?from=2020-01-01&to=2020-01-31'),
    );
    expect(empty.rentReceived).toBe(0);
    expect((await get(c, c.admin, '/reports/revenue?from=2020-02-01&to=2020-01-01')).status).toBe(
      400,
    );

    // Lunas => keluar dari piutang.
    await pay(c, b.id, { purpose: 'RENT', method: 'CASH', amount: 400_000 });
    const after = data<ReceivablesReportDto>(await get(c, c.owner, '/reports/receivables'));
    expect(after.items.map((i) => i.id)).toEqual([a.id]);
  });

  it('filter status invoice memakai status turunan', async () => {
    const c = await setup();
    const a = await invoiceFor(c, (await seedOrder(c)).id, '2000-01-01');
    await invoiceFor(c, (await seedOrder(c)).id, '2099-01-01');
    const overdue = data<{ items: InvoiceDto[]; total: number }>(
      await get(c, c.admin, '/invoices?state=OVERDUE'),
    );
    expect(overdue.total).toBe(1);
    expect(overdue.items[0]?.id).toBe(a.id);
    expect(data<{ total: number }>(await get(c, c.admin, '/invoices?state=UNPAID')).total).toBe(1);
  });
});

describe('pengingat tagihan', () => {
  it('manual dan otomatis tercatat, otomatis maksimal sekali per 24 jam, lunas tidak diingatkan', async () => {
    const c = await setup();
    const due = await invoiceFor(c, (await seedOrder(c)).id, daysFromNow(2));
    const far = await invoiceFor(c, (await seedOrder(c)).id, daysFromNow(30));
    const paid = await invoiceFor(c, (await seedOrder(c)).id, daysFromNow(1));
    await pay(c, paid.id, { purpose: 'RENT', method: 'CASH', amount: 1_000_000 });
    await pay(c, paid.id, { purpose: 'DEPOSIT', method: 'CASH', amount: 200_000 });

    expect(await sendDueReminders(db)).toBe(1);
    expect(await sendDueReminders(db)).toBe(0);
    const after = data<InvoiceDto>(await get(c, c.admin, `/invoices/${due.id}`));
    expect(after.reminders).toHaveLength(1);
    expect(after.reminders[0]?.kind).toBe('AUTO');
    expect(data<InvoiceDto>(await get(c, c.admin, `/invoices/${far.id}`)).reminders).toHaveLength(
      0,
    );

    const bell = data<NotificationListDto>(await get(c, c.owner, '/notifications'));
    expect(bell.items.some((n) => n.type === 'invoice.reminder' && n.entityId === due.id)).toBe(
      true,
    );

    const manual = await post(c, c.admin, `/invoices/${far.id}/remind`, { note: 'Telepon PIC' });
    expect(data<InvoiceDto>(manual).reminders[0]).toMatchObject({
      kind: 'MANUAL',
      note: 'Telepon PIC',
    });
    const none = await post(c, c.admin, `/invoices/${paid.id}/remind`);
    expect(errorCode(none)).toBe('NOTHING_OUTSTANDING');
  });
});

describe('dashboard owner dan metrik aset', () => {
  it('menghitung sebaran status, aset basi, peringkat, dan metrik per aset', async () => {
    const c = await setup();
    const category = await db.category.create({ data: { name: 'Umum' } });
    const product = await db.product.create({
      data: {
        name: 'Panel LED',
        categoryId: category.id,
        pricingUnit: 'PCS',
        unitLabel: 'pcs',
        price: 100_000n,
        deposit: 0n,
      },
    });
    const mk = (n: number, status: 'AVAILABLE' | 'IN_SERVICE', condition: 'GOOD' | 'DAMAGED') =>
      db.asset.create({
        data: {
          code: `AST-D${n}`,
          qrToken: `qrd-${n}-xxxxxxxxxxxxxxxxxxxxxxxx`,
          productId: product.id,
          status,
          condition,
          purchasePrice: 5_000_000n,
          purchaseDate: new Date('2025-01-01T00:00:00Z'),
        },
      });
    const old = await mk(1, 'AVAILABLE', 'GOOD');
    await mk(2, 'IN_SERVICE', 'DAMAGED');
    await db.$executeRaw`UPDATE assets SET updated_at = now() - interval '90 days' WHERE id = ${old.id}::uuid`;

    const dash = data<OwnerDashboardDto>(await get(c, c.owner, '/dashboards/owner?staleDays=30'));
    expect(dash.totalAssets).toBe(2);
    expect(dash.byStatus.AVAILABLE).toBe(1);
    expect(dash.byStatus.IN_SERVICE).toBe(1);
    expect(dash.damaged).toBe(1);
    expect(dash.staleCount).toBe(1);
    expect(dash.staleAssets[0]).toMatchObject({ code: 'AST-D1' });
    expect(dash.staleAssets[0]?.daysSince).toBeGreaterThanOrEqual(89);

    // Satu sewa selesai dikirim + satu tiket servis berbiaya.
    const order = await seedOrder(c, 'CONFIRMED', 100_000n, 0n);
    const user = await db.user.findFirstOrThrow({ where: { role: 'ADMIN' } });
    const pick = await db.pickList.create({
      data: { number: 'PKL-2027-F1', orderId: order.id, status: 'DISPATCHED' },
    });
    await db.pickListItem.create({
      data: {
        pickListId: pick.id,
        assetId: old.id,
        productId: product.id,
        status: 'DISPATCHED',
        dispatchedAt: new Date(),
      },
    });
    await db.serviceTicket.create({
      data: {
        number: 'SVC-2027-F1',
        assetId: old.id,
        complaint: 'Mati',
        status: 'COMPLETED',
        cost: 250_000n,
        conditionBefore: 'GOOD',
        assetStatusBefore: 'AVAILABLE',
        createdBy: user.id,
      },
    });
    const rich = await get(c, c.admin, `/dashboards/owner`);
    expect(data<OwnerDashboardDto>(rich).mostRented[0]).toMatchObject({ code: 'AST-D1', count: 1 });

    const m = data<AssetMetricsDto>(await get(c, c.admin, `/assets/${old.id}/metrics`));
    expect(m).toMatchObject({
      rentalCount: 1,
      rentalDays: 1,
      serviceCount: 1,
      serviceCost: 250_000,
      purchasePrice: 5_000_000,
      incidentCount: 0,
    });
    expect(m.ageDays).toBeGreaterThan(300);
    // Koordinator tidak punya akses biaya.
    const hidden = data<AssetMetricsDto>(await get(c, c.coordinator, `/assets/${old.id}/metrics`));
    expect(hidden.purchasePrice).toBeNull();
    expect(hidden.serviceCost).toBeNull();
    expect(
      (await get(c, c.admin, '/assets/00000000-0000-4000-8000-000000000000/metrics')).status,
    ).toBe(404);
  });
});
