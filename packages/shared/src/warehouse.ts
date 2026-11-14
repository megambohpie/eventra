import { z } from 'zod';
import { ASSET_CONDITIONS, type AssetCondition } from './assets';
import type { OrderStatus } from './orders';
import type { AssetStatus, BadgeVariant } from './status';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

// ---------- Enum & konstanta (TECHNICAL_SPEC §8) ----------

export const PICK_LIST_STATUSES = [
  'OPEN',
  'VERIFIED',
  'DISPATCHED',
  'RETURNED',
  'RETURN_ISSUE',
  'CANCELLED',
] as const;
export type PickListStatus = (typeof PICK_LIST_STATUSES)[number];

export const PICK_ITEM_STATUSES = [
  'PICKED',
  'VERIFIED',
  'DISPATCHED',
  'RETURNED',
  'MISSING',
  'REMOVED',
] as const;
export type PickItemStatus = (typeof PICK_ITEM_STATUSES)[number];

export const SCAN_ACTIONS = [
  'PICK',
  'UNPICK',
  'VERIFY',
  'CHECKOUT',
  'RETURN',
  'RETURN_MISSING',
  'INCIDENT_SCAN',
  'REPLACEMENT_PICK',
  'REPLACEMENT_UNPICK',
  'REPLACEMENT_VERIFY',
  'REPLACEMENT_DISPATCH',
  'REPLACEMENT_RECEIVE',
  'COUNT_OUT',
  'COUNT_RETURN',
] as const;
export type ScanAction = (typeof SCAN_ACTIONS)[number];
export type ScanResult = 'OK' | 'REJECTED';
export type ScanMethod = 'QR' | 'MANUAL';

export const HANDOVER_TYPES = ['OUT', 'RETURN'] as const;
export type HandoverType = (typeof HANDOVER_TYPES)[number];

/** WAREHOUSE = PIC gudang (keluar/kembali); COUNTERPART = penerima (keluar) / pengembali (kembali). */
export const SIGNER_ROLES = ['WAREHOUSE', 'COUNTERPART'] as const;
export type SignerRole = (typeof SIGNER_ROLES)[number];

/** Pesanan yang boleh dibuatkan pick list. */
export const PICKABLE_ORDER_STATUSES: readonly OrderStatus[] = ['CONFIRMED', 'SCHEDULED'];

/** Status aset yang boleh discan saat pengembalian. */
export const RETURNABLE_ASSET_STATUSES: readonly AssetStatus[] = [
  'CHECKED_OUT',
  'IN_TRANSIT',
  'ON_SITE',
  'RETURN_PENDING',
  'ISSUE_ON_SITE',
];

/** Status item pick list yang masih memegang aset (satu aset = satu pick list aktif). */
export const ACTIVE_PICK_ITEM_STATUSES: readonly PickItemStatus[] = [
  'PICKED',
  'VERIFIED',
  'DISPATCHED',
  'MISSING',
];

export const MAX_RETURN_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png'] as const;
export const MAX_SIGNATURE_BYTES = 200 * 1024;

export const PICK_LIST_STATUS_BADGE: Record<PickListStatus, BadgeVariant> = {
  OPEN: 'warning',
  VERIFIED: 'info',
  DISPATCHED: 'primary',
  RETURNED: 'success',
  RETURN_ISSUE: 'error',
  CANCELLED: 'neutral',
};

export const PICK_ITEM_STATUS_BADGE: Record<PickItemStatus, BadgeVariant> = {
  PICKED: 'warning',
  VERIFIED: 'info',
  DISPATCHED: 'primary',
  RETURNED: 'success',
  MISSING: 'error',
  REMOVED: 'neutral',
};

// ---------- Skema request ----------

const qrToken = z.string().trim().min(16).max(64);
const assetCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{3,40}$/);

export const pickListCreateSchema = z.object({ orderId: z.uuid() });
export type PickListCreateInput = z.input<typeof pickListCreateSchema>;

export const pickListListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(PICK_LIST_STATUSES).optional(),
});
export type PickListListQuery = z.input<typeof pickListListQuerySchema>;

/** PICK boleh lewat QR atau kode aset (pilih manual); VERIFY wajib QR (bukti scan). */
export const pickScanSchema = z
  .object({
    action: z.enum(['PICK', 'VERIFY']),
    qrToken: qrToken.optional(),
    assetCode: assetCode.optional(),
    /** PICK saja: aksesori tambahan (include) di luar kebutuhan pesanan, mis. tiang/katrol. */
    extra: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.qrToken) !== Boolean(v.assetCode), {
    path: ['qrToken'],
    message: 'Isi tepat satu: token QR atau kode aset',
  })
  .refine((v) => v.action === 'PICK' || Boolean(v.qrToken), {
    path: ['qrToken'],
    message: 'Verifikasi akhir wajib memindai QR',
  });
export type PickScanInput = z.input<typeof pickScanSchema>;

export const returnScanSchema = z.object({
  qrToken,
  condition: z.enum(ASSET_CONDITIONS),
  note: optionalText(500),
  locationId: z.uuid().optional(),
});
export type ReturnScanInput = z.input<typeof returnScanSchema>;

export const returnCompleteSchema = z.object({
  /** Item yang belum discan ditandai hilang/selisih; wajib dikonfirmasi eksplisit. */
  acceptMissing: z.boolean().default(false),
  note: optionalText(500),
});
export type ReturnCompleteInput = z.input<typeof returnCompleteSchema>;

export const MAX_COUNT_QUANTITY = 100_000;

/**
 * Hitung jumlah barang stok tidak terbatas (tanpa QR). OUT = jumlah dikemas sebelum keluar
 * (minimal sebesar kebutuhan); RETURN = jumlah yang kembali (maksimal sebesar yang dikemas).
 */
export const countSchema = z.object({
  action: z.enum(['OUT', 'RETURN']),
  productId: z.uuid(),
  quantity: z.number().int().min(0).max(MAX_COUNT_QUANTITY),
  /** OUT saja: tambahkan barang stok tidak terbatas di luar kebutuhan pesanan (aksesori include). */
  extra: z.boolean().optional(),
  note: optionalText(500),
});
export type CountInput = z.input<typeof countSchema>;

export const checkoutSchema = z.object({ note: optionalText(500) });
export type CheckoutInput = z.input<typeof checkoutSchema>;

export const documentSignSchema = z.object({
  role: z.enum(SIGNER_ROLES),
  /** PIC pesanan yang menandatangani. */
  picId: z.uuid(),
  /** Gambar tanda tangan PNG sebagai data URL. */
  image: z
    .string()
    .max(Math.ceil(MAX_SIGNATURE_BYTES * 1.4))
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, 'Tanda tangan harus berupa PNG'),
});
export type DocumentSignInput = z.input<typeof documentSignSchema>;

export const documentReviseSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export type DocumentReviseInput = z.input<typeof documentReviseSchema>;

// ---------- DTO ----------

export interface PickListSummaryDto {
  id: string;
  number: string;
  orderId: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  customerName: string;
  status: PickListStatus;
  startDate: string;
  endDate: string;
  eventLocation: string;
  required: number;
  picked: number;
  verified: number;
  dispatchedAt: string | null;
  returnedAt: string | null;
  createdAt: string;
}

export interface PickLineDto {
  productId: string;
  productName: string;
  required: number;
  picked: number;
  verified: number;
  /** Stok tidak terbatas: dibuktikan dengan hitung jumlah (bukan scan QR). */
  unlimited: boolean;
  /** Jumlah dikemas (null = belum dihitung); hanya untuk baris unlimited. */
  packed: number | null;
  /** Jumlah kembali (null = belum dihitung); hanya untuk baris unlimited. */
  returned: number | null;
  /**
   * Baris kelompok "per meter": `required` = m² dipesan, `picked`/`verified` = m² kabinet yang sudah
   * dipilih/diverifikasi (pas dengan `required` agar siap keluar).
   */
  areaPool: boolean;
  /** Aksesori tambahan (include) di luar kebutuhan pesanan. */
  extra: boolean;
}

export interface PickItemDto {
  id: string;
  assetId: string;
  assetCode: string;
  productId: string;
  productName: string;
  serial: string | null;
  status: PickItemStatus;
  assetStatus: AssetStatus;
  assetCondition: AssetCondition;
  pickedAt: string;
  verifiedAt: string | null;
  dispatchedAt: string | null;
  dispatchCondition: AssetCondition | null;
  returnedAt: string | null;
  returnCondition: AssetCondition | null;
  returnNote: string | null;
  photoIds: string[];
  /** Aksesori tambahan (include) di luar kebutuhan pesanan. */
  extra: boolean;
  /** Luas unit ini (m²) bila produknya berukuran; dipakai pada kabinet kelompok "per meter". */
  areaM2: number | null;
}

export interface ScanEventDto {
  id: string;
  action: ScanAction;
  result: ScanResult;
  method: ScanMethod;
  reason: string | null;
  assetCode: string | null;
  /** Barang stok tidak terbatas pada event hitung/keluar. */
  productName: string | null;
  quantity: number | null;
  condition: AssetCondition | null;
  note: string | null;
  actor: string | null;
  createdAt: string;
}

export interface DocumentSignatureDto {
  role: SignerRole;
  signerName: string;
  signerRole: string;
  signedBy: string | null;
  signedAt: string;
}

export interface HandoverItemSnapshot {
  assetCode: string;
  productName: string;
  serial: string | null;
  condition: AssetCondition | null;
  /** Waktu scan terakhir yang relevan (verifikasi untuk keluar, penerimaan untuk kembali). */
  scannedAt: string | null;
  status: PickItemStatus;
  note: string | null;
  /** Aksesori tambahan (include) di luar kebutuhan pesanan. Tidak ada pada dokumen lama. */
  extra?: boolean;
}

/** Snapshot isi dokumen; dibekukan saat dokumen dibuat dan tidak pernah diubah. */
export interface HandoverPayload {
  type: HandoverType;
  orderNumber: string;
  customerName: string;
  eventLocation: string;
  startDate: string;
  endDate: string;
  pickListNumber: string;
  performedBy: string;
  performedAt: string;
  warehousePic: { id: string; name: string; phone: string | null } | null;
  counterpartPics: { id: string; name: string; phone: string | null; role: string }[];
  lines: { productName: string; quantity: number }[];
  /** Kelompok "per meter": luas dipesan vs luas kabinet yang disiapkan (m²). Tidak ada pada dokumen lama. */
  areaLines?: { productName: string; orderedM2: number; packedM2: number }[];
  /**
   * Barang stok tidak terbatas (dihitung, tanpa QR). `returned`/`lost` hanya terisi di berita acara
   * pengembalian; `lost` = dikemas − kembali (dicatat sebagai selisih, tidak memblokir pengembalian).
   * Tidak ada pada dokumen lama.
   */
  countedLines?: {
    productName: string;
    required: number;
    packed: number;
    returned: number | null;
    lost: number | null;
  }[];
  items: HandoverItemSnapshot[];
  summary: { expected: number; returned: number; missing: number };
  note: string | null;
}

export interface HandoverDocumentDto {
  id: string;
  number: string;
  version: number;
  type: HandoverType;
  orderId: string;
  orderNumber: string;
  pickListId: string;
  isLatest: boolean;
  fullySigned: boolean;
  revisionReason: string | null;
  createdBy: string | null;
  createdAt: string;
  payload: HandoverPayload;
  signatures: DocumentSignatureDto[];
}

export interface PickListDto extends PickListSummaryDto {
  lines: PickLineDto[];
  items: PickItemDto[];
  scans: ScanEventDto[];
  documents: HandoverDocumentDto[];
}

export interface ScanOutcomeDto {
  item: PickItemDto;
  pickList: PickListDto;
}

export const docLabel = (type: HandoverType): string =>
  type === 'OUT' ? 'Surat Jalan / Berita Acara Keluar' : 'Berita Acara Pengembalian';
