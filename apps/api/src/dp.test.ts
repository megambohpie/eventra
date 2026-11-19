import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { DpStatusDto, InvoiceDto, PaymentPolicyDto } from '@eventra/shared';
import { createTestApp, db, loginAs, resetDb } from '../test/helpers';
import { assertDpSatisfied } from './finance/service';
import { computeTotals } from './orders/service';

const V1 = '/api/v1';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const data = <T>(res: request.Response) => (res.body as { data: T }).data;
const errorCode = (res: request.Response) => (res.body as { error: { code: string } }).error.code;

interface Ctx {
  app: Express;
  admin: string;
  owner: string;
  orderId: string;
}

let seq = 0;

async function setup(status: 'CONFIRMED' | 'DRAFT' = 'CONFIRMED'): Promise<Ctx> {
  const { app } = createTestApp();
  const customer = await db.customer.create({ data: { type: 'COMPANY', name: 'PT Acara' } });
  seq += 1;
  const order = await db.order.create({
    data: {
      number: `ORD-2027-D${String(seq).padStart(5, '0')}`,
      customerId: customer.id,
      status,
      startDate: new Date('2027-06-10T00:00:00Z'),
      endDate: new Date('2027-06-10T00:00:00Z'),
      eventLocation: 'Balai Kartini',
      subtotal: 1_000_000n,
      depositTotal: 0n,
    },
  });
  return {
    app,
    admin: await loginAs(app, 'ADMIN'),
    owner: await loginAs(app, 'OWNER'),
    orderId: order.id,
  };
}

const post = (c: Ctx, token: string, path: string, body: object = {}) =>
  request(c.app).post(`${V1}${path}`).set(auth(token)).send(body);
const get = (c: Ctx, token: string, path: string) =>
  request(c.app).get(`${V1}${path}`).set(auth(token));
const setPercent = (c: Ctx, percent: number) =>
  request(c.app).put(`${V1}/settings/payment-policy`).set(auth(c.owner)).send({
    dpMinPercent: percent,
  });

beforeEach(resetDb);
afterAll(() => db.$disconnect());

describe('Kebijakan DP: tanpa deposit, barang keluar wajib DP minimum', () => {
  it('deposit dinonaktifkan: total pesanan baru selalu berdeposit 0', () => {
    const totals = computeTotals([{ quantity: 2, unitPrice: 100_000n, unitDeposit: 50_000n }], 3, {
      mode: 'LINE',
      depositOverride: 75_000n,
    });
    expect(totals).toEqual({ subtotal: 600_000n, depositTotal: 0n });
  });

  it('persen DP: semua yang punya akses keuangan membaca, hanya Owner mengubah (0–100)', async () => {
    const c = await setup();
    expect(data<PaymentPolicyDto>(await get(c, c.admin, '/settings/payment-policy'))).toEqual({
      dpMinPercent: 0, // default test (resetDb)
    });
    const denied = await request(c.app)
      .put(`${V1}/settings/payment-policy`)
      .set(auth(c.admin))
      .send({ dpMinPercent: 30 });
    expect(denied.status).toBe(403);
    expect((await setPercent(c, 101)).status).toBe(400);
    expect((await setPercent(c, 30)).status).toBe(200);
    expect(data<PaymentPolicyDto>(await get(c, c.admin, '/settings/payment-policy'))).toEqual({
      dpMinPercent: 30,
    });
    expect(await db.auditLog.count({ where: { action: 'settings.payment_policy' } })).toBe(1);
  });

  it('DP dihitung dari sewa; hanya pembayaran sewa yang diterima (bukan pending) yang dihitung', async () => {
    const c = await setup();
    await setPercent(c, 30);
    const before = data<DpStatusDto>(await get(c, c.admin, `/orders/${c.orderId}/dp`));
    expect(before).toMatchObject({ required: 300_000, paid: 0, shortfall: 300_000, met: false });
    await expect(assertDpSatisfied(db, c.orderId)).rejects.toMatchObject({ code: 'DP_REQUIRED' });

    const inv = data<InvoiceDto>(await post(c, c.admin, '/invoices', { orderId: c.orderId }));
    const pay = (body: object) => post(c, c.admin, `/invoices/${inv.id}/payments`, body);
    await pay({ purpose: 'RENT', method: 'CASH', amount: 200_000 });
    // Gateway masih PENDING → belum dihitung.
    await pay({ purpose: 'RENT', method: 'GATEWAY', amount: 100_000, reference: 'GW-1' });
    const partial = data<DpStatusDto>(await get(c, c.admin, `/orders/${c.orderId}/dp`));
    expect(partial).toMatchObject({ paid: 200_000, shortfall: 100_000, met: false });
    await expect(assertDpSatisfied(db, c.orderId)).rejects.toMatchObject({ code: 'DP_REQUIRED' });

    await pay({ purpose: 'RENT', method: 'CASH', amount: 100_000 });
    const met = data<DpStatusDto>(await get(c, c.admin, `/orders/${c.orderId}/dp`));
    expect(met).toMatchObject({ paid: 300_000, shortfall: 0, met: true, waived: false });
    await expect(assertDpSatisfied(db, c.orderId)).resolves.toBeUndefined();
  });

  it('Owner dapat mengizinkan tanpa DP (alasan wajib, tercatat); Admin tidak', async () => {
    const c = await setup();
    await setPercent(c, 30);
    expect(
      (await post(c, c.admin, `/orders/${c.orderId}/dp-waiver`, { reason: 'VIP' })).status,
    ).toBe(403);
    expect((await post(c, c.owner, `/orders/${c.orderId}/dp-waiver`, { reason: 'x' })).status).toBe(
      400,
    );
    const ok = await post(c, c.owner, `/orders/${c.orderId}/dp-waiver`, {
      reason: 'Pelanggan langganan, bayar saat acara',
    });
    expect(ok.status).toBe(200);
    expect(data<DpStatusDto>(ok)).toMatchObject({
      met: false,
      waived: true,
      waivedReason: 'Pelanggan langganan, bayar saat acara',
    });
    await expect(assertDpSatisfied(db, c.orderId)).resolves.toBeUndefined();
    expect(await db.auditLog.count({ where: { action: 'order.dp_waiver' } })).toBe(1);
  });

  it('izin tanpa DP hanya untuk pesanan terkonfirmasi/terjadwal; persen 0 = tanpa syarat', async () => {
    const draft = await setup('DRAFT');
    const res = await post(draft, draft.owner, `/orders/${draft.orderId}/dp-waiver`, {
      reason: 'Percobaan',
    });
    expect(res.status).toBe(409);
    expect(errorCode(res)).toBe('INVALID_ORDER_STATE');

    // Persen 0 → syarat dimatikan.
    await setPercent(draft, 0);
    await expect(assertDpSatisfied(db, draft.orderId)).resolves.toBeUndefined();
  });
});
