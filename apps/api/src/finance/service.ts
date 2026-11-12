import type { Prisma, PrismaClient } from '@prisma/client';
import {
  computeInvoiceBalance,
  type InvoiceDto,
  type InvoiceSummaryDto,
  type PaymentDto,
} from '@eventra/shared';
import { HttpError } from '../errors';
import { notify, usersWithCapability } from '../incidents/service';
import { userNames } from '../warehouse/service';

type Db = PrismaClient | Prisma.TransactionClient;
export type Tx = Prisma.TransactionClient;

export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

export async function nextInvoiceNumber(tx: Tx, date = new Date()): Promise<string> {
  const rows = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('invoice_number_seq') AS n`;
  return `INV-${date.getUTCFullYear()}-${String(rows[0]?.n ?? 0).padStart(6, '0')}`;
}

/** Kunci baris invoice agar pembayaran/pembatalan serentak tidak melewati batas tagihan. */
export async function lockInvoice(tx: Tx, id: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM invoices WHERE id = ${id}::uuid FOR UPDATE`;
  if (rows.length === 0) throw new HttpError(404, 'NOT_FOUND', 'Invoice tidak ditemukan');
}

export const invoiceInclude = {
  order: { select: { number: true, customer: { select: { name: true } } } },
  payments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.InvoiceInclude;

export type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

/** Jumlah pembayaran per tujuan dan status; hanya SUCCEEDED yang dihitung sebagai uang diterima. */
export function sumPayments(payments: InvoiceRow['payments']) {
  const sum = { paidRent: 0, paidDeposit: 0, pendingRent: 0, pendingDeposit: 0 };
  for (const p of payments) {
    const amount = Number(p.amount);
    if (p.status === 'SUCCEEDED') {
      if (p.purpose === 'RENT') sum.paidRent += amount;
      else sum.paidDeposit += amount;
    } else if (p.status === 'PENDING') {
      if (p.purpose === 'RENT') sum.pendingRent += amount;
      else sum.pendingDeposit += amount;
    }
  }
  return sum;
}

export function balanceOf(row: InvoiceRow, today: string) {
  return computeInvoiceBalance({
    rentAmount: Number(row.rentAmount),
    depositAmount: Number(row.depositAmount),
    ...sumPayments(row.payments),
    dueDate: isoDay(row.dueDate),
    today,
    voided: row.status === 'VOID',
  });
}

export function toInvoiceSummary(row: InvoiceRow, today: string): InvoiceSummaryDto {
  const b = balanceOf(row, today);
  return {
    id: row.id,
    number: row.number,
    orderId: row.orderId,
    orderNumber: row.order.number,
    customerName: row.order.customer.name,
    status: row.status,
    paymentState: b.paymentState,
    rentAmount: Number(row.rentAmount),
    depositAmount: Number(row.depositAmount),
    total: b.total,
    paid: b.paid,
    pending: b.pending,
    outstanding: b.outstanding,
    outstandingRent: b.outstandingRent,
    outstandingDeposit: b.outstandingDeposit,
    payableRent: b.payableRent,
    payableDeposit: b.payableDeposit,
    dueDate: isoDay(row.dueDate),
    overdueDays: b.overdueDays,
    issuedAt: row.issuedAt.toISOString(),
  };
}

export async function toInvoiceDto(db: Db, row: InvoiceRow, today: string): Promise<InvoiceDto> {
  const reminders = await db.invoiceReminder.findMany({
    where: { invoiceId: row.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  const names = await userNames(db, [
    ...row.payments.flatMap((p) => [p.recordedBy, p.confirmedBy]),
    ...reminders.map((r) => r.createdBy),
  ]);
  const name = (id: string | null) => (id ? (names.get(id) ?? null) : null);
  const due = isoDay(row.dueDate);
  const payments: PaymentDto[] = row.payments.map((p) => ({
    id: p.id,
    invoiceId: p.invoiceId,
    purpose: p.purpose,
    method: p.method,
    status: p.status,
    amount: Number(p.amount),
    reference: p.reference,
    note: p.note,
    paidAt: p.paidAt.toISOString(),
    recordedBy: name(p.recordedBy),
    confirmedBy: name(p.confirmedBy),
    confirmedAt: p.confirmedAt?.toISOString() ?? null,
    voidedAt: p.voidedAt?.toISOString() ?? null,
    voidReason: p.voidReason,
    late: p.status === 'SUCCEEDED' && isoDay(p.paidAt) > due,
  }));
  return {
    ...toInvoiceSummary(row, today),
    note: row.note,
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidReason: row.voidReason,
    payments,
    reminders: reminders.map((r) => ({
      id: r.id,
      kind: r.kind,
      note: r.note,
      createdBy: name(r.createdBy),
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export async function loadInvoice(db: Db, id: string): Promise<InvoiceRow> {
  const row = await db.invoice.findUnique({ where: { id }, include: invoiceInclude });
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Invoice tidak ditemukan');
  return row;
}

/**
 * Titik masuk tunggal untuk menyelesaikan pembayaran PENDING. Konfirmasi manual (admin memverifikasi
 * bukti) dan adapter gateway (callback/webhook pada fase rilis) sama-sama memanggil fungsi ini sehingga
 * aturan batas tagihan dan audit tidak bercabang. Klaim status memakai updateMany agar dua konfirmasi
 * serentak tidak menghitung pembayaran dua kali.
 */
export async function settlePayment(
  tx: Tx,
  paymentId: string,
  outcome: { status: 'SUCCEEDED' } | { status: 'FAILED'; reason: string },
  actorId: string | null,
): Promise<{ invoiceId: string; amount: number }> {
  const payment = await tx.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new HttpError(404, 'NOT_FOUND', 'Pembayaran tidak ditemukan');
  await lockInvoice(tx, payment.invoiceId);
  const claimed = await tx.payment.updateMany({
    where: { id: paymentId, status: 'PENDING' },
    data:
      outcome.status === 'SUCCEEDED'
        ? { status: 'SUCCEEDED', confirmedBy: actorId, confirmedAt: new Date() }
        : {
            status: 'FAILED',
            confirmedBy: actorId,
            confirmedAt: new Date(),
            voidedAt: new Date(),
            voidReason: outcome.reason,
          },
  });
  if (claimed.count === 0) {
    throw new HttpError(409, 'INVALID_PAYMENT_STATE', 'Pembayaran tidak lagi menunggu konfirmasi');
  }
  return { invoiceId: payment.invoiceId, amount: Number(payment.amount) };
}

// ---------- Pengingat tagihan ----------

/** Pengingat otomatis dikirim bila jatuh tempo ≤ N hari lagi (atau sudah lewat). */
export const REMINDER_LEAD_DAYS = 3;
/** Satu pengingat per invoice per jeda ini. */
export const REMINDER_INTERVAL_MS = 24 * 3_600_000;

/** Catat pengingat dan beri tahu pemegang akses keuangan (saluran WhatsApp/email masuk backlog). */
export async function recordReminder(
  tx: Tx,
  row: InvoiceRow,
  kind: 'MANUAL' | 'AUTO',
  actorId: string | null,
  note: string | undefined,
  today: string,
): Promise<void> {
  const b = balanceOf(row, today);
  await tx.invoiceReminder.create({
    data: { invoiceId: row.id, kind, note: note ?? null, createdBy: actorId },
  });
  await notify(tx, await usersWithCapability(tx, 'finance.read'), {
    type: 'invoice.reminder',
    entity: 'invoice',
    entityId: row.id,
    params: {
      number: row.number,
      customer: row.order.customer.name,
      outstanding: String(b.outstanding),
      dueDate: isoDay(row.dueDate),
      overdueDays: String(b.overdueDays),
    },
  });
}

/**
 * Job pengingat: invoice aktif yang belum lunas dan jatuh tempo dalam REMINDER_LEAD_DAYS (termasuk yang
 * sudah lewat) menerima satu pengingat per 24 jam. Mengembalikan jumlah pengingat yang dibuat.
 */
export async function sendDueReminders(db: PrismaClient, now = new Date()): Promise<number> {
  const today = isoDay(now);
  const horizon = new Date(`${today}T00:00:00.000Z`);
  horizon.setUTCDate(horizon.getUTCDate() + REMINDER_LEAD_DAYS);
  const rows = await db.invoice.findMany({
    where: { status: 'ISSUED', dueDate: { lte: horizon } },
    include: invoiceInclude,
  });
  const since = new Date(now.getTime() - REMINDER_INTERVAL_MS);
  let sent = 0;
  for (const row of rows) {
    if (balanceOf(row, today).outstanding === 0) continue;
    const recent = await db.invoiceReminder.findFirst({
      where: { invoiceId: row.id, createdAt: { gt: since } },
      select: { id: true },
    });
    if (recent) continue;
    await db.$transaction((tx) => recordReminder(tx, row, 'AUTO', null, undefined, today));
    sent += 1;
  }
  return sent;
}
