import { randomBytes } from 'node:crypto';
import type {
  Asset,
  AssetStatusEvent,
  Category,
  Location,
  Prisma,
  Product,
  StockReceipt,
  User,
} from '@prisma/client';
import {
  NON_ALLOCATABLE_STATUSES,
  needsAttention,
  type AssetCondition,
  type AssetDto,
  type AssetEventDto,
  type AssetScanDto,
  type AssetStatus,
} from '@eventra/shared';

export const assetInclude = {
  product: { include: { category: true } },
  location: true,
  receipt: { select: { number: true, receivedDate: true } },
  _count: { select: { photos: true } },
} satisfies Prisma.AssetInclude;

type AssetRow = Asset & {
  product: Product & { category: Category };
  location: Location | null;
  receipt: Pick<StockReceipt, 'number' | 'receivedDate'> | null;
  _count: { photos: number };
};

const isoDate = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

/** `canSeeCost` menentukan apakah harga beli disertakan (capability `asset.cost.read`). */
export function toAssetDto(a: AssetRow, canSeeCost: boolean): AssetDto {
  return {
    id: a.id,
    code: a.code,
    productId: a.productId,
    product: {
      id: a.product.id,
      name: a.product.name,
      sku: a.product.sku,
      category: { id: a.product.category.id, name: a.product.category.name },
    },
    serial: a.serial,
    condition: a.condition,
    status: a.status,
    locationId: a.locationId,
    location: a.location ? { id: a.location.id, name: a.location.name } : null,
    supplier: a.supplier,
    purchaseDate: isoDate(a.purchaseDate),
    acquiredDate:
      isoDate(a.purchaseDate) ??
      isoDate(a.receipt?.receivedDate ?? null) ??
      a.createdAt.toISOString().slice(0, 10),
    ...(canSeeCost
      ? { purchasePrice: a.purchasePrice === null ? null : Number(a.purchasePrice) }
      : {}),
    receiptId: a.receiptId,
    receiptNumber: a.receipt?.number ?? null,
    notes: a.notes,
    needsAttention: needsAttention(a.status, a.condition),
    photoCount: a._count.photos,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

/** Hasil scan QR: tanpa harga beli, pemasok, maupun data pelanggan. */
export function toScanDto(a: AssetRow): AssetScanDto {
  return {
    id: a.id,
    code: a.code,
    productName: a.product.name,
    condition: a.condition,
    status: a.status,
    allocatable: a.status === 'AVAILABLE' && !NON_ALLOCATABLE_STATUSES.includes(a.status),
    location: a.location?.name ?? null,
  };
}

export const eventInclude = {
  actor: { select: { name: true } },
  fromLocation: { select: { name: true } },
  toLocation: { select: { name: true } },
} satisfies Prisma.AssetStatusEventInclude;

type EventRow = AssetStatusEvent & {
  actor: Pick<User, 'name'> | null;
  fromLocation: Pick<Location, 'name'> | null;
  toLocation: Pick<Location, 'name'> | null;
};

export function toEventDto(e: EventRow, receiptNumbers: Map<string, string>): AssetEventDto {
  return {
    id: e.id,
    type: e.type,
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
    fromCondition: e.fromCondition,
    toCondition: e.toCondition,
    fromLocation: e.fromLocation?.name ?? null,
    toLocation: e.toLocation?.name ?? null,
    receiptId: e.receiptId,
    receiptNumber: e.receiptId ? (receiptNumbers.get(e.receiptId) ?? null) : null,
    note: e.note,
    actor: e.actor?.name ?? null,
    createdAt: e.createdAt.toISOString(),
  };
}

/** Token QR acak (144 bit); tidak memuat informasi apa pun tentang aset. */
export const newQrToken = (): string => randomBytes(18).toString('base64url');

export const QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** Aset rusak tidak boleh langsung tersedia (invarian 4): masuk karantina. */
export const initialStatus = (condition: AssetCondition): AssetStatus =>
  condition === 'DAMAGED' ? 'QUARANTINED' : 'AVAILABLE';

type Tx = Prisma.TransactionClient;

/** Kode aset berurutan dari sequence Postgres (atomik antar transaksi). */
export async function nextAssetCodes(tx: Tx, count: number): Promise<string[]> {
  const rows = await tx.$queryRaw<{ n: bigint }[]>`
    SELECT nextval('asset_code_seq') AS n FROM generate_series(1, ${count}::int)`;
  return rows.map((r) => `AST-${String(r.n).padStart(6, '0')}`);
}

export async function nextReceiptNumber(tx: Tx, date: Date): Promise<string> {
  const rows = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('stock_receipt_number_seq') AS n`;
  return `RCV-${date.getUTCFullYear()}-${String(rows[0]?.n ?? 0).padStart(6, '0')}`;
}

export const dateOnlyToDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
