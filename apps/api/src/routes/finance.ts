import { Router } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  ACTIVE_ORDER_STATUSES,
  INVOICEABLE_ORDER_STATUSES,
  invoiceCreateSchema,
  invoiceListQuerySchema,
  invoiceVoidSchema,
  paymentCreateSchema,
  paymentReasonSchema,
  reminderInputSchema,
  revenueQuerySchema,
  type InvoiceDto,
  type InvoiceSummaryDto,
  type Page,
  type ReceivableItemDto,
  type ReceivablesReportDto,
  type RevenueGroup,
  type RevenuePointDto,
  type RevenueReportDto,
} from '@eventra/shared';
import { writeAudit } from '../audit';
import { currentUser, requireCapability } from '../auth/middleware';
import { dateOnlyToDate } from '../assets/service';
import { HttpError } from '../errors';
import { parseId } from '../http';
import {
  balanceOf,
  invoiceInclude,
  isoDay,
  loadInvoice,
  lockInvoice,
  nextInvoiceNumber,
  recordReminder,
  settlePayment,
  toInvoiceDto,
  toInvoiceSummary,
} from '../finance/service';

const DAY_MS = 86_400_000;
/** Toleransi jam perangkat: pembayaran tidak boleh dicatat di masa depan. */
const FUTURE_SKEW_MS = 5 * 60_000;

const periodOf = (day: string, group: RevenueGroup): string =>
  group === 'year' ? day.slice(0, 4) : group === 'month' ? day.slice(0, 7) : day;

/** Semua periode dari `from` hingga `to` (termasuk yang kosong) agar grafik tidak berlubang. */
function periods(from: string, to: string, group: RevenueGroup): string[] {
  const out = new Set<string>();
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY_MS) {
    out.add(periodOf(new Date(t).toISOString().slice(0, 10), group));
  }
  return [...out];
}

export function financeRouter(db: PrismaClient): Router {
  const router = Router();
  const today = () => isoDay(new Date());

  const respond = async (id: string): Promise<InvoiceDto> =>
    toInvoiceDto(db, await loadInvoice(db, id), today());

  // ---------- Invoice ----------

  router.get('/invoices', requireCapability('finance.read'), async (req, res) => {
    const q = invoiceListQuerySchema.parse(req.query);
    const and: Prisma.InvoiceWhereInput[] = [];
    if (q.orderId) and.push({ orderId: q.orderId });
    if (q.state === 'VOID') and.push({ status: 'VOID' });
    else if (q.state) and.push({ status: 'ISSUED' });
    if (q.q) {
      and.push({
        OR: [
          { number: { contains: q.q, mode: 'insensitive' } },
          { order: { number: { contains: q.q, mode: 'insensitive' } } },
          { order: { customer: { name: { contains: q.q, mode: 'insensitive' } } } },
        ],
      });
    }
    const now = today();
    // Status pembayaran diturunkan dari pembayaran diterima, jadi disaring setelah dihitung.
    const rows = await db.invoice.findMany({
      where: { AND: and },
      include: invoiceInclude,
      orderBy: [{ issuedAt: 'desc' }],
    });
    const all = rows
      .map((r) => toInvoiceSummary(r, now))
      .filter((i) => !q.state || i.paymentState === q.state);
    const data: Page<InvoiceSummaryDto> = {
      items: all.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
      total: all.length,
      page: q.page,
      pageSize: q.pageSize,
    };
    res.json({ data });
  });

  router.get('/invoices/:id', requireCapability('finance.read'), async (req, res) => {
    res.json({ data: await respond(parseId(req.params.id)) });
  });

  /** Terbitkan invoice dari nilai pesanan (snapshot sewa + deposit); satu invoice aktif per pesanan. */
  router.post('/invoices', requireCapability('finance.write'), async (req, res) => {
    const input = invoiceCreateSchema.parse(req.body);
    const user = currentUser(req);
    const id = await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: input.orderId } });
      if (!order) throw new HttpError(400, 'INVALID_REFERENCE', 'Pesanan tidak ditemukan');
      if (!(INVOICEABLE_ORDER_STATUSES as readonly string[]).includes(order.status)) {
        throw new HttpError(
          409,
          'ORDER_NOT_INVOICEABLE',
          `Pesanan berstatus ${order.status}; invoice hanya untuk pesanan yang menahan stok atau selesai`,
        );
      }
      const active = await tx.invoice.findFirst({
        where: { orderId: order.id, status: 'ISSUED' },
        select: { number: true },
      });
      if (active) {
        throw new HttpError(
          409,
          'INVOICE_EXISTS',
          `Pesanan ini sudah punya invoice aktif (${active.number})`,
        );
      }
      if (order.subtotal + order.depositTotal <= 0n) {
        throw new HttpError(409, 'NOTHING_TO_INVOICE', 'Nilai pesanan nol; tidak ada yang ditagih');
      }
      const invoice = await tx.invoice.create({
        data: {
          number: await nextInvoiceNumber(tx),
          orderId: order.id,
          rentAmount: order.subtotal,
          depositAmount: order.depositTotal,
          dueDate: input.dueDate ? dateOnlyToDate(input.dueDate) : order.startDate,
          note: input.note ?? null,
          createdBy: user.id,
        },
      });
      await writeAudit(tx, req, {
        action: 'invoice.create',
        entity: 'invoice',
        entityId: invoice.id,
        after: {
          number: invoice.number,
          orderNumber: order.number,
          rentAmount: invoice.rentAmount,
          depositAmount: invoice.depositAmount,
          dueDate: isoDay(invoice.dueDate),
        },
      });
      return invoice.id;
    });
    res.status(201).json({ data: await respond(id) });
  });

  /** Batalkan invoice (mis. salah nominal) lalu terbitkan ulang. Ditolak bila sudah ada pembayaran aktif. */
  router.post('/invoices/:id/void', requireCapability('finance.write'), async (req, res) => {
    const id = parseId(req.params.id);
    const { reason } = invoiceVoidSchema.parse(req.body);
    await db.$transaction(async (tx) => {
      await lockInvoice(tx, id);
      const invoice = await tx.invoice.findUniqueOrThrow({
        where: { id },
        include: { payments: true },
      });
      if (invoice.status !== 'ISSUED') {
        throw new HttpError(409, 'INVALID_INVOICE_STATE', 'Invoice sudah dibatalkan');
      }
      if (invoice.payments.some((p) => p.status === 'SUCCEEDED' || p.status === 'PENDING')) {
        throw new HttpError(
          409,
          'INVOICE_HAS_PAYMENTS',
          'Batalkan (void) pembayaran invoice ini terlebih dahulu',
        );
      }
      await tx.invoice.update({
        where: { id },
        data: { status: 'VOID', voidedAt: new Date(), voidReason: reason },
      });
      await writeAudit(tx, req, {
        action: 'invoice.void',
        entity: 'invoice',
        entityId: id,
        before: { status: 'ISSUED' },
        after: { status: 'VOID', reason },
      });
    });
    res.json({ data: await respond(id) });
  });

  /** Kirim pengingat manual (dicatat; pemegang akses keuangan diberi notifikasi dalam aplikasi). */
  router.post('/invoices/:id/remind', requireCapability('finance.write'), async (req, res) => {
    const id = parseId(req.params.id);
    const { note } = reminderInputSchema.parse(req.body ?? {});
    const user = currentUser(req);
    await db.$transaction(async (tx) => {
      const row = await loadInvoice(tx, id);
      if (row.status !== 'ISSUED' || balanceOf(row, today()).outstanding === 0) {
        throw new HttpError(409, 'NOTHING_OUTSTANDING', 'Invoice tidak memiliki sisa tagihan');
      }
      await recordReminder(tx, row, 'MANUAL', user.id, note, today());
      await writeAudit(tx, req, {
        action: 'invoice.remind',
        entity: 'invoice',
        entityId: id,
        after: { number: row.number },
      });
    });
    res.json({ data: await respond(id) });
  });

  // ---------- Pembayaran ----------

  /**
   * Catat pembayaran. Tunai/transfer/lainnya dicatat oleh admin yang telah memverifikasi uangnya (langsung
   * SUCCEEDED); GATEWAY menunggu konfirmasi (PENDING). Nominal dibatasi sisa tagihan per tujuan (sewa/deposit)
   * termasuk pembayaran yang masih PENDING.
   */
  router.post('/invoices/:id/payments', requireCapability('finance.write'), async (req, res) => {
    const id = parseId(req.params.id);
    const input = paymentCreateSchema.parse(req.body);
    const user = currentUser(req);
    const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
    if (paidAt.getTime() > Date.now() + FUTURE_SKEW_MS) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Waktu pembayaran tidak boleh di masa depan', {
        paidAt: ['Waktu pembayaran tidak boleh di masa depan'],
      });
    }
    await db.$transaction(async (tx) => {
      await lockInvoice(tx, id);
      const row = await loadInvoice(tx, id);
      if (row.status !== 'ISSUED') {
        throw new HttpError(409, 'INVALID_INVOICE_STATE', 'Invoice sudah dibatalkan');
      }
      const b = balanceOf(row, today());
      const payable = input.purpose === 'RENT' ? b.payableRent : b.payableDeposit;
      if (input.amount > payable) {
        throw new HttpError(
          409,
          'OVERPAYMENT',
          `Nominal melebihi sisa tagihan ${input.purpose === 'RENT' ? 'sewa' : 'deposit'} (${payable})`,
        );
      }
      const confirmed = input.method !== 'GATEWAY';
      const payment = await tx.payment.create({
        data: {
          invoiceId: id,
          purpose: input.purpose,
          method: input.method,
          status: confirmed ? 'SUCCEEDED' : 'PENDING',
          amount: BigInt(input.amount),
          reference: input.reference ?? null,
          note: input.note ?? null,
          paidAt,
          recordedBy: user.id,
          confirmedBy: confirmed ? user.id : null,
          confirmedAt: confirmed ? new Date() : null,
        },
      });
      await writeAudit(tx, req, {
        action: 'payment.create',
        entity: 'payment',
        entityId: payment.id,
        after: {
          invoiceNumber: row.number,
          purpose: payment.purpose,
          method: payment.method,
          status: payment.status,
          amount: payment.amount,
          reference: payment.reference,
        },
      });
    });
    res.status(201).json({ data: await respond(id) });
  });

  /** Konfirmasi pembayaran PENDING (verifikasi bukti manual atau hasil gateway). */
  router.post('/payments/:id/confirm', requireCapability('finance.write'), async (req, res) => {
    const id = parseId(req.params.id);
    const user = currentUser(req);
    const invoiceId = await db.$transaction(async (tx) => {
      const settled = await settlePayment(tx, id, { status: 'SUCCEEDED' }, user.id);
      await writeAudit(tx, req, {
        action: 'payment.confirm',
        entity: 'payment',
        entityId: id,
        before: { status: 'PENDING' },
        after: { status: 'SUCCEEDED', amount: settled.amount },
      });
      return settled.invoiceId;
    });
    res.json({ data: await respond(invoiceId) });
  });

  router.post('/payments/:id/reject', requireCapability('finance.write'), async (req, res) => {
    const id = parseId(req.params.id);
    const { reason } = paymentReasonSchema.parse(req.body);
    const user = currentUser(req);
    const invoiceId = await db.$transaction(async (tx) => {
      const settled = await settlePayment(tx, id, { status: 'FAILED', reason }, user.id);
      await writeAudit(tx, req, {
        action: 'payment.reject',
        entity: 'payment',
        entityId: id,
        before: { status: 'PENDING' },
        after: { status: 'FAILED', reason },
      });
      return settled.invoiceId;
    });
    res.json({ data: await respond(invoiceId) });
  });

  /** Koreksi: pembayaran keliru dibatalkan (baris tetap ada dengan alasan; tidak dihapus/diubah nominalnya). */
  router.post('/payments/:id/void', requireCapability('finance.write'), async (req, res) => {
    const id = parseId(req.params.id);
    const { reason } = paymentReasonSchema.parse(req.body);
    const invoiceId = await db.$transaction(async (tx) => {
      const found = await tx.payment.findUnique({ where: { id } });
      if (!found) throw new HttpError(404, 'NOT_FOUND', 'Pembayaran tidak ditemukan');
      await lockInvoice(tx, found.invoiceId);
      const claimed = await tx.payment.updateMany({
        where: { id, status: { in: ['PENDING', 'SUCCEEDED'] } },
        data: { status: 'VOIDED', voidedAt: new Date(), voidReason: reason },
      });
      if (claimed.count === 0) {
        throw new HttpError(409, 'INVALID_PAYMENT_STATE', 'Pembayaran sudah dibatalkan/ditolak');
      }
      await writeAudit(tx, req, {
        action: 'payment.void',
        entity: 'payment',
        entityId: id,
        before: { status: found.status, amount: found.amount },
        after: { status: 'VOIDED', reason },
      });
      return found.invoiceId;
    });
    res.json({ data: await respond(invoiceId) });
  });

  // ---------- Laporan ----------

  /**
   * Pendapatan diterima = pembayaran sewa berstatus SUCCEEDED menurut tanggal diterima (UTC). Deposit
   * dilaporkan terpisah dan tidak pernah masuk pendapatan; tagihan belum dibayar tidak muncul di sini.
   */
  router.get('/reports/revenue', requireCapability('finance.read'), async (req, res) => {
    const q = revenueQuerySchema.parse(req.query);
    const payments = await db.payment.findMany({
      where: {
        status: 'SUCCEEDED',
        paidAt: {
          gte: new Date(`${q.from}T00:00:00.000Z`),
          lt: new Date(Date.parse(`${q.to}T00:00:00.000Z`) + DAY_MS),
        },
      },
      include: { invoice: { select: { dueDate: true } } },
    });
    const series = new Map<string, RevenuePointDto>(
      periods(q.from, q.to, q.groupBy).map((period) => [
        period,
        { period, rentReceived: 0, depositReceived: 0, payments: 0 },
      ]),
    );
    const report: RevenueReportDto = {
      from: q.from,
      to: q.to,
      groupBy: q.groupBy,
      rentReceived: 0,
      depositReceived: 0,
      payments: payments.length,
      latePayments: 0,
      latePaymentsAmount: 0,
      series: [],
    };
    for (const p of payments) {
      const amount = Number(p.amount);
      const point = series.get(periodOf(isoDay(p.paidAt), q.groupBy));
      if (point) point.payments += 1;
      if (p.purpose === 'RENT') {
        report.rentReceived += amount;
        if (point) point.rentReceived += amount;
      } else {
        report.depositReceived += amount;
        if (point) point.depositReceived += amount;
      }
      if (isoDay(p.paidAt) > isoDay(p.invoice.dueDate)) {
        report.latePayments += 1;
        report.latePaymentsAmount += amount;
      }
    }
    report.series = [...series.values()];
    res.json({ data: report });
  });

  /** Piutang aktual per invoice (sisa setelah pembayaran diterima) dan nilai sewa pesanan berjalan. */
  router.get('/reports/receivables', requireCapability('finance.read'), async (_req, res) => {
    const now = today();
    const invoices = await db.invoice.findMany({
      where: { status: 'ISSUED' },
      include: invoiceInclude,
    });
    const open = invoices
      .map((row) => ({ row, dto: toInvoiceSummary(row, now) }))
      .filter((x) => x.dto.outstanding > 0)
      .sort((a, b) => a.dto.dueDate.localeCompare(b.dto.dueDate));
    const pics = await db.orderPic.findMany({
      where: { orderId: { in: open.map((x) => x.row.orderId) }, role: 'CUSTOMER_PIC' },
      orderBy: { createdAt: 'asc' },
    });
    const items: ReceivableItemDto[] = open.map(({ row, dto }) => ({
      ...dto,
      pics: pics
        .filter((p) => p.orderId === row.orderId)
        .map((p) => ({ name: p.name, phone: p.phone })),
    }));
    const active = await db.order.aggregate({
      where: { status: { in: [...ACTIVE_ORDER_STATUSES] } },
      _sum: { subtotal: true },
      _count: { _all: true },
    });
    const overdue = items.filter((i) => i.paymentState === 'OVERDUE');
    const sum = (list: ReceivableItemDto[], pick: (i: ReceivableItemDto) => number) =>
      list.reduce((n, i) => n + pick(i), 0);
    const data: ReceivablesReportDto = {
      summary: {
        asOf: now,
        invoices: items.length,
        totalOutstanding: sum(items, (i) => i.outstanding),
        rentOutstanding: sum(items, (i) => i.outstandingRent),
        depositOutstanding: sum(items, (i) => i.outstandingDeposit),
        overdueInvoices: overdue.length,
        overdueOutstanding: sum(overdue, (i) => i.outstanding),
        activeOrders: active._count._all,
        activeOrderValue: Number(active._sum.subtotal ?? 0n),
      },
      items,
    };
    res.json({ data });
  });

  return router;
}
