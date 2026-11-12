import { z } from 'zod';
import { phoneSchema } from './master';
import type { BadgeVariant } from './status';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const dateOnly = z.iso.date();

// ---------- Status pesanan (TECHNICAL_SPEC §5) ----------

export const ORDER_STATUSES = [
  'DRAFT',
  'PENDING_REVIEW',
  'QUOTED',
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'ISSUE',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Transisi yang valid; setiap perubahan divalidasi backend dan dicatat sebagai event. */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT: ['PENDING_REVIEW', 'CANCELLED'],
  PENDING_REVIEW: ['QUOTED', 'REJECTED', 'CANCELLED'],
  QUOTED: ['AWAITING_PAYMENT', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'QUOTED'],
  AWAITING_PAYMENT: ['CONFIRMED', 'EXPIRED', 'CANCELLED'],
  CONFIRMED: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'ISSUE'],
  ISSUE: ['IN_PROGRESS', 'COMPLETED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export const canTransitionOrder = (from: OrderStatus, to: OrderStatus): boolean =>
  ORDER_TRANSITIONS[from].includes(to);

/** Status yang masih boleh dibatalkan sebelum barang keluar gudang. */
export const CANCELLABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  'DRAFT',
  'PENDING_REVIEW',
  'QUOTED',
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'SCHEDULED',
];

/** Status yang mengubah stok: pembatalan di sini memerlukan `order.approve`. */
export const ALLOCATED_ORDER_STATUSES: readonly OrderStatus[] = [
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'SCHEDULED',
  'IN_PROGRESS',
  'ISSUE',
];

export const ORDER_STATUS_BADGE: Record<OrderStatus, BadgeVariant> = {
  DRAFT: 'neutral',
  PENDING_REVIEW: 'warning',
  QUOTED: 'info',
  AWAITING_PAYMENT: 'warning',
  CONFIRMED: 'success',
  SCHEDULED: 'success',
  IN_PROGRESS: 'primary',
  COMPLETED: 'neutral',
  REJECTED: 'error',
  CANCELLED: 'error',
  EXPIRED: 'neutral',
  ISSUE: 'error',
};

// ---------- Tanggal sewa ----------

/** Batas rentang sewa agar jumlah baris alokasi per pesanan terbatas. */
export const MAX_RENTAL_DAYS = 120;
const DAY_MS = 86_400_000;

const toUtc = (value: string): number => Date.parse(`${value}T00:00:00.000Z`);

/** Jumlah hari sewa, tanggal mulai dan selesai sama-sama dihitung (PRD §ketersediaan). */
export const rentalDays = (start: string, end: string): number =>
  Math.round((toUtc(end) - toUtc(start)) / DAY_MS) + 1;

/** Daftar tanggal `YYYY-MM-DD` dari `start` hingga `end` inklusif. */
export function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  for (let t = toUtc(start); t <= toUtc(end); t += DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

const dateRange = <T extends { startDate: string; endDate: string }>(r: T): boolean =>
  rentalDays(r.startDate, r.endDate) >= 1 && rentalDays(r.startDate, r.endDate) <= MAX_RENTAL_DAYS;
const dateRangeMessage = {
  path: ['endDate'],
  message: `Tanggal selesai harus sama/setelah tanggal mulai dan maksimal ${MAX_RENTAL_DAYS} hari`,
};

// ---------- Paket / konversi ----------

export const bundleComponentSchema = z.object({
  componentProductId: z.uuid(),
  quantity: z.number().int().min(1).max(1000),
});
export const bundleInputSchema = z
  .object({ components: z.array(bundleComponentSchema).max(20) })
  .refine(
    (b) => new Set(b.components.map((c) => c.componentProductId)).size === b.components.length,
    { path: ['components'], message: 'Komponen duplikat' },
  );
export type BundleInput = z.input<typeof bundleInputSchema>;

export interface BundleComponentDto {
  componentProductId: string;
  componentName: string;
  /** Jumlah aset fisik per 1 satuan sewa. */
  quantity: number;
}
export interface ProductBundleDto {
  productId: string;
  productName: string;
  unitLabel: string;
  components: BundleComponentDto[];
}

// ---------- Ketersediaan ----------

export const requestItemSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().min(1).max(100_000),
});

export const availabilityCheckSchema = z
  .object({
    startDate: dateOnly,
    endDate: dateOnly,
    items: z.array(requestItemSchema).min(1).max(50),
    /** Abaikan alokasi pesanan ini (mis. saat memeriksa ulang pesanan sendiri). */
    excludeOrderId: z.uuid().optional(),
  })
  .refine(dateRange, dateRangeMessage);
export type AvailabilityCheckInput = z.input<typeof availabilityCheckSchema>;

export const availabilityCalendarQuerySchema = z
  .object({
    from: dateOnly,
    to: dateOnly,
    productId: z.uuid().optional(),
  })
  .refine((r) => rentalDays(r.from, r.to) >= 1 && rentalDays(r.from, r.to) <= 62, {
    path: ['to'],
    message: 'Rentang kalender maksimal 62 hari',
  });
export type AvailabilityCalendarQuery = z.input<typeof availabilityCalendarQuerySchema>;

export interface ComponentAvailabilityDto {
  productId: string;
  productName: string;
  /** Aset fisik yang dibutuhkan per baris ini. */
  required: number;
  /** Sisa terkecil sepanjang rentang sewa. */
  minRemaining: number;
  total: number;
}

export interface ItemAvailabilityDto {
  productId: string;
  productName: string;
  requested: number;
  /** Kuantitas satuan sewa maksimum yang masih dapat dipenuhi pada seluruh tanggal. */
  maxQuantity: number;
  available: boolean;
  components: ComponentAvailabilityDto[];
}

export interface AvailabilityResultDto {
  startDate: string;
  endDate: string;
  ok: boolean;
  items: ItemAvailabilityDto[];
}

export interface AvailabilityDayDto {
  date: string;
  productId: string;
  productName: string;
  total: number;
  confirmed: number;
  held: number;
  remaining: number;
}

// ---------- Pesanan ----------

export const orderItemInputSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().min(1).max(100_000),
});

export const orderInputSchema = z
  .object({
    customerId: z.uuid(),
    startDate: dateOnly,
    endDate: dateOnly,
    eventLocation: z.string().trim().min(1).max(300),
    note: optionalText(1000),
    items: z.array(orderItemInputSchema).min(1).max(50),
  })
  .refine(dateRange, dateRangeMessage)
  .refine((o) => new Set(o.items.map((i) => i.productId)).size === o.items.length, {
    path: ['items'],
    message: 'Produk duplikat pada item pesanan',
  });
export type OrderInput = z.input<typeof orderInputSchema>;

export const orderListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(ORDER_STATUSES).optional(),
  customerId: z.uuid().optional(),
  /** Pesanan yang rentang sewanya beririsan dengan [from, to]. */
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});
export type OrderListQuery = z.input<typeof orderListQuerySchema>;

export const quoteInputSchema = z.object({ note: optionalText(500) });
export type QuoteInput = z.input<typeof quoteInputSchema>;

export const MIN_HOLD_MINUTES = 5;
export const MAX_HOLD_MINUTES = 1440;
export const DEFAULT_HOLD_MINUTES = 60;
export const holdInputSchema = z.object({
  holdMinutes: z.number().int().min(MIN_HOLD_MINUTES).max(MAX_HOLD_MINUTES).optional(),
});
export type HoldInput = z.input<typeof holdInputSchema>;

export const orderNoteSchema = z.object({ note: optionalText(500) });
export type OrderNoteInput = z.input<typeof orderNoteSchema>;

export interface OrderItemComponentDto {
  productId: string;
  productName: string;
  /** Aset fisik per 1 satuan sewa. */
  perUnit: number;
  /** Total aset fisik untuk baris ini (per hari). */
  required: number;
}

export interface OrderItemDto {
  id: string;
  productId: string;
  productName: string;
  unitLabel: string;
  quantity: number;
  unitPrice: number;
  unitDeposit: number;
  lineTotal: number;
  lineDeposit: number;
  components: OrderItemComponentDto[];
}

export interface QuoteDto {
  id: string;
  version: number;
  subtotal: number;
  depositTotal: number;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface OrderStatusEventDto {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  actor: string | null;
  createdAt: string;
}

export interface OrderSummaryDto {
  id: string;
  number: string;
  status: OrderStatus;
  customerId: string;
  customerName: string;
  startDate: string;
  endDate: string;
  days: number;
  eventLocation: string;
  subtotal: number;
  depositTotal: number;
  holdExpiresAt: string | null;
  createdAt: string;
}

export interface OrderDto extends OrderSummaryDto {
  note: string | null;
  confirmedAt: string | null;
  items: OrderItemDto[];
  pics: OrderPicDto[];
  quotes: QuoteDto[];
  history: OrderStatusEventDto[];
}

// ---------- PIC pesanan ----------

export const PIC_ROLES = ['CUSTOMER_PIC', 'WAREHOUSE_OUT', 'WAREHOUSE_IN', 'FIELD'] as const;
export type PicRole = (typeof PIC_ROLES)[number];

/** Asal PIC (PRD): pemilik/internal, penyewa, atau pihak ketiga tepercaya. */
export const PIC_SOURCES = ['OWNER', 'CUSTOMER', 'THIRD_PARTY'] as const;
export type PicSource = (typeof PIC_SOURCES)[number];

/** Peran yang wajib dipegang pengguna internal. */
export const INTERNAL_ONLY_PIC_ROLES: readonly PicRole[] = ['WAREHOUSE_OUT', 'WAREHOUSE_IN'];
/** Peran pengguna internal yang boleh menjadi PIC gudang. */
export const WAREHOUSE_PIC_USER_ROLES = ['WAREHOUSE', 'OPS_COORDINATOR', 'ADMIN'] as const;
/** Peran selain PIC penyewa hanya boleh satu per pesanan. */
export const SINGLE_PIC_ROLES: readonly PicRole[] = ['WAREHOUSE_OUT', 'WAREHOUSE_IN', 'FIELD'];

export const picInputSchema = z
  .object({
    role: z.enum(PIC_ROLES),
    source: z.enum(PIC_SOURCES),
    /** Pengguna internal; bila ada, nama/telepon diambil dari akun. */
    userId: z.uuid().optional(),
    name: optionalText(160),
    phone: phoneSchema,
    organization: optionalText(160),
    /** Bukti/otorisasi persetujuan gudang untuk PIC pihak ketiga. */
    authorization: optionalText(500),
  })
  .superRefine((p, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (p.source === 'OWNER') {
      if (!p.userId) issue('userId', 'PIC pemilik harus berupa pengguna internal');
    } else {
      if (p.userId) issue('userId', 'Pengguna internal hanya untuk sumber Pemilik');
      if (!p.name) issue('name', 'Nama wajib diisi');
      if (!p.phone) issue('phone', 'Nomor telepon wajib diisi');
    }
    if (p.source === 'THIRD_PARTY') {
      if (!p.organization) issue('organization', 'Organisasi/relasi wajib diisi');
      if (!p.authorization) issue('authorization', 'Bukti/otorisasi persetujuan wajib diisi');
    }
    if (INTERNAL_ONLY_PIC_ROLES.includes(p.role) && p.source !== 'OWNER') {
      issue('source', 'PIC gudang harus pengguna internal');
    }
  });
export type PicInput = z.input<typeof picInputSchema>;

export interface OrderPicDto {
  id: string;
  role: PicRole;
  source: PicSource;
  userId: string | null;
  name: string;
  phone: string | null;
  organization: string | null;
  authorization: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

// ---------- Kalender stok keluar/kembali ----------

export const orderCalendarQuerySchema = availabilityCalendarQuerySchema;
export const calendarDayQuerySchema = z.object({ date: dateOnly });

export interface CalendarDayDto {
  date: string;
  outgoingOrders: number;
  outgoingUnits: number;
  returningOrders: number;
  returningUnits: number;
}

export interface CalendarMovementDto {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  customerName: string;
  eventLocation: string;
  startDate: string;
  endDate: string;
  items: { productName: string; unitLabel: string; quantity: number }[];
  /** Aset fisik per produk pemenuhan pada tanggal tersebut. */
  units: { productName: string; quantity: number }[];
  pics: Pick<OrderPicDto, 'role' | 'name' | 'phone' | 'source'>[];
}

export interface CalendarDayDetailDto {
  date: string;
  outgoing: CalendarMovementDto[];
  returning: CalendarMovementDto[];
}
