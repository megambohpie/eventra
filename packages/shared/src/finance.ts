import { z } from 'zod';
import type { AssetCondition } from './assets';
import type { AssetStatus, BadgeVariant } from './status';

const dateOnly = z.iso.date();
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/** Batas nominal satu transaksi (rupiah, integer) agar aman di BigInt/JSON number. */
export const MAX_MONEY = 1_000_000_000_000;
const money = z.number().int().min(1).max(MAX_MONEY);

const DAY_MS = 86_400_000;

// ---------- Invoice ----------

export const INVOICE_STATUSES = ['ISSUED', 'VOID'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Status pembayaran turunan (PRD: Belum dibayar, Sebagian, Lunas, Terlambat). */
export const INVOICE_PAYMENT_STATES = ['UNPAID', 'PARTIAL', 'PAID', 'OVERDUE', 'VOID'] as const;
export type InvoicePaymentState = (typeof INVOICE_PAYMENT_STATES)[number];

export const INVOICE_STATE_BADGE: Record<InvoicePaymentState, BadgeVariant> = {
  UNPAID: 'warning',
  PARTIAL: 'info',
  PAID: 'success',
  OVERDUE: 'error',
  VOID: 'neutral',
};

/** Status pesanan yang boleh ditagih (stok sudah dialokasikan atau pesanan selesai). */
export const INVOICEABLE_ORDER_STATUSES = [
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'SCHEDULED',
  'IN_PROGRESS',
  'ISSUE',
  'COMPLETED',
] as const;

/** Pesanan berjalan untuk laporan "nilai sewa pesanan aktif". */
export const ACTIVE_ORDER_STATUSES = ['CONFIRMED', 'SCHEDULED', 'IN_PROGRESS', 'ISSUE'] as const;

export const PAYMENT_PURPOSES = ['RENT', 'DEPOSIT'] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

export const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'GATEWAY', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['PENDING', 'SUCCEEDED', 'FAILED', 'VOIDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_BADGE: Record<PaymentStatus, BadgeVariant> = {
  PENDING: 'warning',
  SUCCEEDED: 'success',
  FAILED: 'error',
  VOIDED: 'neutral',
};

export interface InvoiceBalanceInput {
  rentAmount: number;
  depositAmount: number;
  /** Pembayaran berstatus SUCCEEDED (uang benar-benar diterima). */
  paidRent: number;
  paidDeposit: number;
  /** Pembayaran PENDING; belum dihitung sebagai diterima, tetapi menahan batas bayar. */
  pendingRent: number;
  pendingDeposit: number;
  dueDate: string;
  /** Tanggal hari ini `YYYY-MM-DD` (UTC). */
  today: string;
  voided: boolean;
}

export interface InvoiceBalance {
  total: number;
  paid: number;
  pending: number;
  outstandingRent: number;
  outstandingDeposit: number;
  /** Piutang aktual: sisa tagihan setelah pembayaran diterima. */
  outstanding: number;
  /** Sisa yang masih boleh dibayar (sudah dikurangi pembayaran PENDING). */
  payableRent: number;
  payableDeposit: number;
  paymentState: InvoicePaymentState;
  overdueDays: number;
}

const utcDay = (value: string) => Date.parse(`${value}T00:00:00.000Z`);

/** Hitung saldo invoice; satu-satunya sumber kebenaran piutang (backend dan test). */
export function computeInvoiceBalance(i: InvoiceBalanceInput): InvoiceBalance {
  const total = i.rentAmount + i.depositAmount;
  const outstandingRent = i.voided ? 0 : Math.max(0, i.rentAmount - i.paidRent);
  const outstandingDeposit = i.voided ? 0 : Math.max(0, i.depositAmount - i.paidDeposit);
  const outstanding = outstandingRent + outstandingDeposit;
  const paid = i.paidRent + i.paidDeposit;
  const late = Math.floor((utcDay(i.today) - utcDay(i.dueDate)) / DAY_MS);
  let paymentState: InvoicePaymentState;
  if (i.voided) paymentState = 'VOID';
  else if (outstanding === 0) paymentState = 'PAID';
  else if (late > 0) paymentState = 'OVERDUE';
  else paymentState = paid > 0 ? 'PARTIAL' : 'UNPAID';
  return {
    total,
    paid,
    pending: i.pendingRent + i.pendingDeposit,
    outstandingRent,
    outstandingDeposit,
    outstanding,
    payableRent: i.voided ? 0 : Math.max(0, i.rentAmount - i.paidRent - i.pendingRent),
    payableDeposit: i.voided ? 0 : Math.max(0, i.depositAmount - i.paidDeposit - i.pendingDeposit),
    paymentState,
    overdueDays: outstanding > 0 && late > 0 ? late : 0,
  };
}

export const invoiceCreateSchema = z.object({
  orderId: z.uuid(),
  /** Default: tanggal mulai sewa. */
  dueDate: dateOnly.optional(),
  note: optionalText(500),
});
export type InvoiceCreateInput = z.input<typeof invoiceCreateSchema>;

export const invoiceVoidSchema = z.object({ reason: z.string().trim().min(3).max(300) });
export type InvoiceVoidInput = z.input<typeof invoiceVoidSchema>;

export const invoiceListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  state: z.enum(INVOICE_PAYMENT_STATES).optional(),
  orderId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type InvoiceListQuery = z.input<typeof invoiceListQuerySchema>;

export const paymentCreateSchema = z
  .object({
    purpose: z.enum(PAYMENT_PURPOSES),
    method: z.enum(PAYMENT_METHODS),
    amount: money,
    /** Nomor bukti transfer / referensi gateway. */
    reference: optionalText(120),
    note: optionalText(300),
    /** Waktu uang diterima; default sekarang. */
    paidAt: z.iso.datetime().optional(),
  })
  .refine((v) => v.method === 'CASH' || v.method === 'OTHER' || Boolean(v.reference), {
    path: ['reference'],
    message: 'Referensi/bukti wajib untuk transfer bank dan gateway',
  });
export type PaymentCreateInput = z.input<typeof paymentCreateSchema>;

export const paymentReasonSchema = z.object({ reason: z.string().trim().min(3).max(300) });
export type PaymentReasonInput = z.input<typeof paymentReasonSchema>;

export const reminderInputSchema = z.object({ note: optionalText(300) });
export type ReminderInput = z.input<typeof reminderInputSchema>;

export interface PaymentDto {
  id: string;
  invoiceId: string;
  purpose: PaymentPurpose;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  reference: string | null;
  note: string | null;
  paidAt: string;
  recordedBy: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  /** Dibayar setelah jatuh tempo (hanya relevan untuk pembayaran diterima). */
  late: boolean;
}

export interface ReminderDto {
  id: string;
  kind: 'MANUAL' | 'AUTO';
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface InvoiceSummaryDto {
  id: string;
  number: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  status: InvoiceStatus;
  paymentState: InvoicePaymentState;
  rentAmount: number;
  depositAmount: number;
  total: number;
  paid: number;
  pending: number;
  outstanding: number;
  outstandingRent: number;
  outstandingDeposit: number;
  payableRent: number;
  payableDeposit: number;
  dueDate: string;
  overdueDays: number;
  issuedAt: string;
}

export interface InvoiceDto extends InvoiceSummaryDto {
  note: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  payments: PaymentDto[];
  reminders: ReminderDto[];
}

/** Piutang per invoice beserta PIC penyewa (PRD: rincian piutang owner). */
export interface ReceivableItemDto extends InvoiceSummaryDto {
  pics: { name: string; phone: string | null }[];
}

// ---------- Laporan ----------

export const REVENUE_GROUPS = ['day', 'month', 'year'] as const;
export type RevenueGroup = (typeof REVENUE_GROUPS)[number];

export const revenueQuerySchema = z
  .object({
    from: dateOnly,
    to: dateOnly,
    groupBy: z.enum(REVENUE_GROUPS).default('day'),
  })
  .refine((v) => v.from <= v.to, { path: ['to'], message: 'Tanggal akhir harus setelah awal' })
  .refine((v) => Date.parse(v.to) - Date.parse(v.from) <= 366 * 5 * DAY_MS, {
    path: ['to'],
    message: 'Rentang maksimal 5 tahun',
  });
export type RevenueQuery = z.input<typeof revenueQuerySchema>;

export interface RevenuePointDto {
  /** `YYYY-MM-DD`, `YYYY-MM`, atau `YYYY` sesuai pengelompokan. */
  period: string;
  rentReceived: number;
  depositReceived: number;
  payments: number;
}

export interface RevenueReportDto {
  from: string;
  to: string;
  groupBy: RevenueGroup;
  /** Pendapatan sewa diterima = pembayaran sewa SUCCEEDED dalam periode (deposit tidak termasuk). */
  rentReceived: number;
  depositReceived: number;
  payments: number;
  /** Pembayaran yang diterima setelah jatuh tempo invoice. */
  latePayments: number;
  latePaymentsAmount: number;
  series: RevenuePointDto[];
}

export interface ReceivablesSummaryDto {
  asOf: string;
  invoices: number;
  totalOutstanding: number;
  rentOutstanding: number;
  depositOutstanding: number;
  overdueInvoices: number;
  overdueOutstanding: number;
  /** Nilai sewa pesanan berjalan (bukan pendapatan diterima). */
  activeOrders: number;
  activeOrderValue: number;
}

export interface ReceivablesReportDto {
  summary: ReceivablesSummaryDto;
  items: ReceivableItemDto[];
}

// ---------- Dashboard owner ----------

export const dashboardQuerySchema = z.object({
  staleDays: z.coerce.number().int().min(1).max(365).default(30),
});
export type DashboardQuery = z.input<typeof dashboardQuerySchema>;

export interface AssetRankDto {
  assetId: string;
  code: string;
  productName: string;
  count: number;
}

export interface StaleAssetDto {
  assetId: string;
  code: string;
  productName: string;
  status: AssetStatus;
  condition: AssetCondition;
  lastUpdateAt: string;
  daysSince: number;
}

export interface OwnerDashboardDto {
  generatedAt: string;
  staleDays: number;
  totalAssets: number;
  byStatus: Record<AssetStatus, number>;
  /** Aset tidak pensiun dengan kondisi rusak. */
  damaged: number;
  staleCount: number;
  staleAssets: StaleAssetDto[];
  openIncidents: number;
  openServiceTickets: number;
  mostRented: AssetRankDto[];
  mostDamaged: AssetRankDto[];
}

export interface AssetMetricsDto {
  assetId: string;
  ageDays: number | null;
  purchaseDate: string | null;
  /** Hanya untuk pemegang `asset.cost.read`. */
  purchasePrice: number | null;
  rentalCount: number;
  /** Total hari sewa pesanan tempat aset dikirim (tanggal mulai dan selesai dihitung). */
  rentalDays: number;
  serviceCount: number;
  /** Hanya untuk pemegang `asset.cost.read`. */
  serviceCost: number | null;
  incidentCount: number;
}
