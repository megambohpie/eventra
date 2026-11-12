import { z } from 'zod';
import type { CategoryDto, LocationDto } from './master';
import { ASSET_STATUSES, type AssetStatus } from './status';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const ASSET_CONDITIONS = ['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'] as const;
export type AssetCondition = (typeof ASSET_CONDITIONS)[number];

export const RECEIPT_SOURCES = [
  'PURCHASE',
  'TRANSFER',
  'GRANT',
  'CONSIGNMENT',
  'PRODUCTION',
  'OTHER',
] as const;
export type ReceiptSource = (typeof RECEIPT_SOURCES)[number];

export const RECEIPT_STATUSES = ['DRAFT', 'RECEIVED', 'CANCELLED'] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

export const ASSET_EVENT_TYPES = [
  'RECEIVED',
  'CREATED',
  'STATUS_CHANGED',
  'CONDITION_CHANGED',
  'LOCATION_CHANGED',
  'QR_REGENERATED',
  'UPDATED',
] as const;
export type AssetEventType = (typeof ASSET_EVENT_TYPES)[number];

/** Status yang tidak boleh dialokasikan ke pesanan (TECHNICAL_SPEC §4, invarian 4). */
export const NON_ALLOCATABLE_STATUSES: readonly AssetStatus[] = [
  'IN_SERVICE',
  'QUARANTINED',
  'RETIRED',
  'ISSUE_ON_SITE',
];

/** Kondisi dan status yang membuat aset perlu perhatian. */
export const ATTENTION_CONDITIONS: readonly AssetCondition[] = ['POOR', 'DAMAGED'];
export const ATTENTION_STATUSES: readonly AssetStatus[] = [
  'IN_SERVICE',
  'QUARANTINED',
  'ISSUE_ON_SITE',
];

/**
 * Transisi status yang boleh dilakukan manual (Fase 02). Transisi operasional
 * (RESERVED…RETURN_PENDING) terjadi lewat alur pesanan/scan pada fase berikutnya.
 */
export const MANUAL_STATUS_TRANSITIONS: Record<AssetStatus, readonly AssetStatus[]> = {
  AVAILABLE: ['IN_SERVICE', 'QUARANTINED', 'RETIRED'],
  IN_SERVICE: ['AVAILABLE', 'QUARANTINED', 'RETIRED'],
  QUARANTINED: ['AVAILABLE', 'IN_SERVICE', 'RETIRED'],
  RESERVED: [],
  PREPARED: [],
  CHECKED_OUT: [],
  IN_TRANSIT: [],
  ON_SITE: [],
  RETURN_PENDING: [],
  ISSUE_ON_SITE: [],
  RETIRED: [],
};

export const needsAttention = (status: AssetStatus, condition: AssetCondition): boolean =>
  ATTENTION_STATUSES.includes(status) || ATTENTION_CONDITIONS.includes(condition);

const rupiah = z.number().int().min(0).max(100_000_000_000);
const dateOnly = z.iso.date();

export const assetCreateSchema = z.object({
  productId: z.uuid(),
  serial: optionalText(80),
  condition: z.enum(ASSET_CONDITIONS).default('GOOD'),
  locationId: z.uuid().optional(),
  supplier: optionalText(160),
  purchaseDate: dateOnly.optional(),
  purchasePrice: rupiah.optional(),
  notes: optionalText(500),
});
export type AssetCreateInput = z.input<typeof assetCreateSchema>;

export const assetUpdateSchema = z.object({
  serial: optionalText(80),
  locationId: z.uuid().nullable().optional(),
  supplier: optionalText(160),
  purchaseDate: dateOnly.nullable().optional(),
  purchasePrice: rupiah.nullable().optional(),
  notes: optionalText(500),
});
export type AssetUpdateInput = z.input<typeof assetUpdateSchema>;

export const assetConditionChangeSchema = z.object({
  condition: z.enum(ASSET_CONDITIONS),
  note: optionalText(500),
});
export type AssetConditionChangeInput = z.input<typeof assetConditionChangeSchema>;

export const assetStatusChangeSchema = z.object({
  status: z.enum(ASSET_STATUSES),
  note: optionalText(500),
});
export type AssetStatusChangeInput = z.input<typeof assetStatusChangeSchema>;

export const assetListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(ASSET_STATUSES).optional(),
  condition: z.enum(ASSET_CONDITIONS).optional(),
  locationId: z.uuid().optional(),
  productId: z.uuid().optional(),
  attention: z.enum(['true', 'false']).optional(),
});
export type AssetListQuery = z.input<typeof assetListQuerySchema>;

export const MAX_LABELS = 100;
export const labelIdsSchema = z
  .string()
  .transform((v) => v.split(',').filter(Boolean))
  .pipe(z.array(z.uuid()).min(1).max(MAX_LABELS));

export const MAX_RECEIPT_UNITS = 1000;

export const receiptItemSchema = z
  .object({
    productId: z.uuid(),
    quantity: z.number().int().min(1).max(500),
    unitCost: rupiah.optional(),
    condition: z.enum(ASSET_CONDITIONS).default('GOOD'),
    serials: z.array(z.string().trim().min(1).max(80)).max(500).default([]),
  })
  .refine((item) => item.serials.length <= item.quantity, {
    path: ['serials'],
    message: 'Jumlah serial melebihi kuantitas',
  })
  .refine((item) => new Set(item.serials).size === item.serials.length, {
    path: ['serials'],
    message: 'Serial duplikat',
  });

export const receiptInputSchema = z
  .object({
    source: z.enum(RECEIPT_SOURCES),
    sourceRef: optionalText(120),
    supplier: optionalText(160),
    locationId: z.uuid(),
    receivedDate: dateOnly,
    note: optionalText(500),
    items: z.array(receiptItemSchema).min(1).max(50),
  })
  .refine((r) => r.items.reduce((n, i) => n + i.quantity, 0) <= MAX_RECEIPT_UNITS, {
    path: ['items'],
    message: 'Total unit melebihi batas penerimaan',
  });
export type ReceiptInput = z.input<typeof receiptInputSchema>;

export const receiptListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(RECEIPT_STATUSES).optional(),
});
export type ReceiptListQuery = z.input<typeof receiptListQuerySchema>;

export interface AssetProductRef {
  id: string;
  name: string;
  sku: string | null;
  category: CategoryDto;
}

export interface AssetDto {
  id: string;
  code: string;
  productId: string;
  product: AssetProductRef;
  serial: string | null;
  condition: AssetCondition;
  status: AssetStatus;
  locationId: string | null;
  location: Pick<LocationDto, 'id' | 'name'> | null;
  supplier: string | null;
  purchaseDate: string | null;
  /** Hanya ada bila pemanggil memiliki capability `asset.cost.read`. */
  purchasePrice?: number | null;
  receiptId: string | null;
  receiptNumber: string | null;
  notes: string | null;
  needsAttention: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Hasil scan QR: sengaja tanpa harga/biaya dan tanpa data pelanggan. */
export interface AssetScanDto {
  id: string;
  code: string;
  productName: string;
  condition: AssetCondition;
  status: AssetStatus;
  allocatable: boolean;
  location: string | null;
}

export interface AssetSummaryDto {
  total: number;
  attention: number;
  byStatus: Partial<Record<AssetStatus, number>>;
  byCondition: Partial<Record<AssetCondition, number>>;
}

export interface AssetEventDto {
  id: string;
  type: AssetEventType;
  fromStatus: AssetStatus | null;
  toStatus: AssetStatus | null;
  fromCondition: AssetCondition | null;
  toCondition: AssetCondition | null;
  fromLocation: string | null;
  toLocation: string | null;
  receiptId: string | null;
  receiptNumber: string | null;
  note: string | null;
  actor: string | null;
  createdAt: string;
}

export interface ReceiptItemDto {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  /** Hanya ada bila pemanggil memiliki capability `asset.cost.read`. */
  unitCost?: number | null;
  condition: AssetCondition;
  serials: string[];
}

export interface ReceiptDto {
  id: string;
  number: string;
  source: ReceiptSource;
  status: ReceiptStatus;
  sourceRef: string | null;
  supplier: string | null;
  locationId: string;
  locationName: string;
  receivedDate: string;
  receivedBy: string | null;
  receivedAt: string | null;
  note: string | null;
  totalUnits: number;
  items: ReceiptItemDto[];
  /** Id aset yang dihasilkan (hanya pada detail, setelah RECEIVED). */
  assetIds?: string[];
  createdAt: string;
}
