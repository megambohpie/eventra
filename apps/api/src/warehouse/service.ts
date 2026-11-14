import type {
  AssetCondition as DbAssetCondition,
  AssetStatus as DbAssetStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import {
  CM2_PER_M2,
  unitAreaCm2,
  unitAreaM2,
  type AssetStatus,
  type HandoverDocumentDto,
  type HandoverItemSnapshot,
  type HandoverPayload,
  type HandoverType,
  type OrderStatus,
  type PickItemDto,
  type PickLineDto,
  type PickListDto,
  type PickListSummaryDto,
  type ScanEventDto,
} from '@eventra/shared';
import { HttpError } from '../errors';

type Db = PrismaClient | Prisma.TransactionClient;
export type Tx = Prisma.TransactionClient;

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

// ---------- Include & tipe baris ----------

/** Ukuran dan kelompok "per meter" produk item pick list (untuk hitung luas kabinet). */
export const sizeSelect = { areaPoolId: true, widthCm: true, heightCm: true } as const;

export const summaryInclude = {
  order: { include: { customer: { select: { name: true } } } },
  lines: true,
  items: {
    select: { status: true, productId: true, extra: true, product: { select: sizeSelect } },
  },
} satisfies Prisma.PickListInclude;

export const pickListInclude = {
  order: { include: { customer: { select: { name: true } } } },
  lines: { include: { product: { select: { name: true } } } },
  items: {
    where: { status: { not: 'REMOVED' } },
    include: {
      asset: true,
      product: { select: { name: true, ...sizeSelect } },
      photos: { select: { id: true }, orderBy: { createdAt: 'asc' } },
    },
    orderBy: { pickedAt: 'asc' },
  },
  scans: {
    include: {
      asset: { select: { code: true } },
      product: { select: { name: true } },
      actor: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  },
  documents: { include: { signatures: true, order: { select: { number: true } } } },
} satisfies Prisma.PickListInclude;

type SummaryRow = Prisma.PickListGetPayload<{ include: typeof summaryInclude }>;
export type PickListRow = Prisma.PickListGetPayload<{ include: typeof pickListInclude }>;
type ItemRow = PickListRow['items'][number];
type DocumentRow = PickListRow['documents'][number];

export async function loadPickList(db: Db, id: string): Promise<PickListRow> {
  const row = await db.pickList.findUnique({ where: { id }, include: pickListInclude });
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Pick list tidak ditemukan');
  return row;
}

// ---------- DTO ----------

/** Bentuk minimal item pick list untuk menghitung kelengkapan/progres baris. */
export interface ProgressItem {
  productId: string;
  status: string;
  extra: boolean;
  product: { areaPoolId: string | null; widthCm: number | null; heightCm: number | null };
}

export interface ProgressLine {
  productId: string;
  quantity: number;
  unlimited: boolean;
  areaPool: boolean;
  packedQty: number | null;
}

const itemAreaCm2 = (i: ProgressItem): number => unitAreaCm2(i.product) ?? 0;

/** Item yang memenuhi baris: kabinet anggota (kelompok per meter), atau produk sama yang bukan tambahan. */
const itemsOfLine = (l: ProgressLine, items: ProgressItem[]) =>
  l.areaPool
    ? items.filter((i) => i.product.areaPoolId === l.productId)
    : items.filter((i) => i.productId === l.productId && !i.extra);

/**
 * Progres satu baris dalam satuan baris itu: unit (aset berQR), m² (kelompok per meter, mis. 1,75),
 * atau jumlah dikemas (stok tidak terbatas, maksimal sebesar kebutuhan).
 */
export function lineProgress(
  l: ProgressLine,
  items: ProgressItem[],
): { picked: number; verified: number } {
  if (l.unlimited) {
    const counted = Math.min(l.packedQty ?? 0, l.quantity);
    return { picked: counted, verified: counted };
  }
  const mine = itemsOfLine(l, items);
  const verified = mine.filter((i) => i.status !== 'PICKED');
  if (l.areaPool) {
    const m2 = (list: ProgressItem[]) => list.reduce((n, i) => n + itemAreaCm2(i), 0) / CM2_PER_M2;
    return { picked: m2(mine), verified: m2(verified) };
  }
  return { picked: mine.length, verified: verified.length };
}

/**
 * Pick list siap keluar bila semua aset terverifikasi (scan), jumlah per produk berQR terpenuhi,
 * luas kabinet kelompok "per meter" PAS sama dengan luas dipesan, dan setiap baris stok tidak
 * terbatas sudah dikemas minimal sebesar kebutuhannya (hitung jumlah).
 */
export function pickListComplete(lines: ProgressLine[], items: ProgressItem[]): boolean {
  return (
    items.every((i) => i.status === 'VERIFIED') &&
    lines.every((l) => {
      if (l.unlimited) return (l.packedQty ?? 0) >= l.quantity;
      const mine = itemsOfLine(l, items);
      if (l.areaPool) {
        return mine.reduce((n, i) => n + itemAreaCm2(i), 0) === l.quantity * CM2_PER_M2;
      }
      return mine.length === l.quantity;
    })
  );
}

export function toSummaryDto(p: SummaryRow): PickListSummaryDto {
  const active = p.items.filter((i) => i.status !== 'REMOVED');
  const progress = p.lines.map((l) => lineProgress(l, active));
  // Aksesori tambahan di luar baris (mis. tiang) ikut dihitung sebagai item terpilih/terverifikasi.
  const loose = active.filter(
    (i) => !p.lines.some((l) => !l.unlimited && itemsOfLine(l, [i]).length > 0),
  );
  const picked = progress.reduce((n, x) => n + x.picked, 0) + loose.length;
  const verified =
    progress.reduce((n, x) => n + x.verified, 0) +
    loose.filter((i) => i.status !== 'PICKED').length;
  return {
    id: p.id,
    number: p.number,
    orderId: p.orderId,
    orderNumber: p.order.number,
    orderStatus: p.order.status,
    customerName: p.order.customer.name,
    status: p.status,
    startDate: isoDate(p.order.startDate),
    endDate: isoDate(p.order.endDate),
    eventLocation: p.order.eventLocation,
    required: p.lines.reduce((n, l) => n + l.quantity, 0),
    picked,
    verified,
    dispatchedAt: p.dispatchedAt?.toISOString() ?? null,
    returnedAt: p.returnedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

export const toItemDto = (i: ItemRow): PickItemDto => ({
  id: i.id,
  assetId: i.assetId,
  assetCode: i.asset.code,
  productId: i.productId,
  productName: i.product.name,
  serial: i.asset.serial,
  status: i.status,
  assetStatus: i.asset.status,
  assetCondition: i.asset.condition,
  pickedAt: i.pickedAt.toISOString(),
  verifiedAt: i.verifiedAt?.toISOString() ?? null,
  dispatchedAt: i.dispatchedAt?.toISOString() ?? null,
  dispatchCondition: i.dispatchCondition,
  returnedAt: i.returnedAt?.toISOString() ?? null,
  returnCondition: i.returnCondition,
  returnNote: i.returnNote,
  photoIds: i.photos.map((p) => p.id),
  extra: i.extra,
  areaM2: unitAreaM2(i.product),
});

function toDocumentDto(
  d: DocumentRow,
  latest: Map<HandoverType, number>,
  names: Map<string, string>,
): HandoverDocumentDto {
  const signatures = [...d.signatures].sort((a, b) => a.signedAt.getTime() - b.signedAt.getTime());
  return {
    id: d.id,
    number: d.number,
    version: d.version,
    type: d.type,
    orderId: d.orderId,
    orderNumber: d.order.number,
    pickListId: d.pickListId,
    isLatest: latest.get(d.type) === d.version,
    fullySigned: signatures.length >= 2,
    revisionReason: d.revisionReason,
    createdBy: d.createdBy ? (names.get(d.createdBy) ?? null) : null,
    createdAt: d.createdAt.toISOString(),
    payload: d.payload as unknown as HandoverPayload,
    signatures: signatures.map((s) => ({
      role: s.role,
      signerName: s.signerName,
      signerRole: s.signerRole,
      signedBy: s.signedBy ? (names.get(s.signedBy) ?? null) : null,
      signedAt: s.signedAt.toISOString(),
    })),
  };
}

/** Versi terbaru per jenis dokumen pada satu pick list. */
function latestVersions(docs: { type: HandoverType; version: number }[]) {
  const latest = new Map<HandoverType, number>();
  for (const d of docs) latest.set(d.type, Math.max(latest.get(d.type) ?? 0, d.version));
  return latest;
}

export async function userNames(db: Db, ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((i): i is string => Boolean(i)))];
  const users = await db.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(users.map((u) => [u.id, u.name]));
}

export async function toDocumentDtos(db: Db, docs: DocumentRow[]): Promise<HandoverDocumentDto[]> {
  const names = await userNames(db, [
    ...docs.map((d) => d.createdBy),
    ...docs.flatMap((d) => d.signatures.map((s) => s.signedBy)),
  ]);
  const latest = latestVersions(docs);
  return [...docs]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((d) => toDocumentDto(d, latest, names));
}

export async function toPickListDto(db: Db, p: PickListRow): Promise<PickListDto> {
  const lines: PickLineDto[] = p.lines
    .map((l) => {
      const { picked, verified } = lineProgress(l, p.items);
      return {
        productId: l.productId,
        productName: l.product.name,
        required: l.quantity,
        picked,
        verified,
        unlimited: l.unlimited,
        packed: l.unlimited ? l.packedQty : null,
        returned: l.unlimited ? l.returnedQty : null,
        areaPool: l.areaPool,
        extra: l.extra,
      };
    })
    .sort((a, b) => a.productName.localeCompare(b.productName));
  const scans: ScanEventDto[] = p.scans.map((s) => ({
    id: s.id,
    action: s.action,
    result: s.result,
    method: s.method,
    reason: s.reason,
    assetCode: s.asset?.code ?? null,
    productName: s.product?.name ?? null,
    quantity: s.quantity,
    condition: s.condition,
    note: s.note,
    actor: s.actor?.name ?? null,
    createdAt: s.createdAt.toISOString(),
  }));
  return {
    ...toSummaryDto({ ...p, items: p.items }),
    lines,
    items: p.items.map(toItemDto),
    scans,
    documents: await toDocumentDtos(db, p.documents),
  };
}

// ---------- Penomoran ----------

export async function nextPickListNumber(tx: Tx, date = new Date()): Promise<string> {
  const rows = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('pick_list_number_seq') AS n`;
  return `PKL-${date.getUTCFullYear()}-${String(rows[0]?.n ?? 0).padStart(6, '0')}`;
}

/** Surat jalan keluar `SJ-`, berita acara pengembalian `BAR-`; revisi memakai nomor yang sama. */
export async function nextDocumentNumber(
  tx: Tx,
  type: HandoverType,
  date = new Date(),
): Promise<string> {
  const rows =
    type === 'OUT'
      ? await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('handover_out_number_seq') AS n`
      : await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('handover_return_number_seq') AS n`;
  const prefix = type === 'OUT' ? 'SJ' : 'BAR';
  return `${prefix}-${date.getUTCFullYear()}-${String(rows[0]?.n ?? 0).padStart(6, '0')}`;
}

// ---------- Kunci & penolakan scan ----------

/**
 * Kunci pick list (serialisasi scan per pick list) dan baca status pesanan dengan kunci bersama,
 * sehingga pembatalan pesanan tidak dapat berpapasan dengan scan yang sedang berjalan.
 * Urutan kunci (pick list lalu pesanan) sama dengan `lockOrderPickLists` agar bebas deadlock.
 */
export async function lockPickList(tx: Tx, id: string): Promise<OrderStatus> {
  const rows = await tx.$queryRaw<{ order_status: OrderStatus }[]>`
    SELECT o.status::text AS order_status
    FROM pick_lists pl JOIN orders o ON o.id = pl.order_id
    WHERE pl.id = ${id}::uuid
    FOR UPDATE OF pl FOR SHARE OF o`;
  const row = rows[0];
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Pick list tidak ditemukan');
  return row.order_status;
}

/** Kunci semua pick list aktif suatu pesanan (dipakai sebelum membatalkan pesanan). */
export async function lockOrderPickLists(tx: Tx, orderId: string): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM pick_lists WHERE order_id = ${orderId}::uuid AND status <> 'CANCELLED'
    ORDER BY id FOR UPDATE`;
}

/** Penolakan scan: dicatat sebagai scan event REJECTED di luar transaksi yang dibatalkan. */
export class ScanRejected extends HttpError {
  constructor(
    code: string,
    message: string,
    readonly assetId: string | null = null,
    status = 409,
  ) {
    super(status, code, message);
    this.name = 'ScanRejected';
  }
}

// ---------- Aset ----------

export async function recordAssetEvent(
  tx: Tx,
  data: {
    assetId: string;
    type: 'STATUS_CHANGED' | 'CONDITION_CHANGED' | 'LOCATION_CHANGED';
    fromStatus?: DbAssetStatus | null;
    toStatus?: DbAssetStatus | null;
    fromCondition?: DbAssetCondition | null;
    toCondition?: DbAssetCondition | null;
    fromLocationId?: string | null;
    toLocationId?: string | null;
    note?: string | null;
    actorId: string | null;
  },
): Promise<void> {
  await tx.assetStatusEvent.create({ data });
}

/** Pindah status aset secara atomik (klaim bersyarat status asal) dan catat riwayatnya. */
export async function moveAsset(
  tx: Tx,
  asset: { id: string; status: AssetStatus; condition: DbAssetCondition },
  to: AssetStatus,
  actorId: string | null,
  note: string,
  extra: Prisma.AssetUncheckedUpdateManyInput = {},
): Promise<void> {
  const claimed = await tx.asset.updateMany({
    where: { id: asset.id, status: asset.status },
    data: { ...extra, status: to },
  });
  if (claimed.count === 0) {
    throw new HttpError(409, 'CONFLICT', 'Aset diubah pihak lain, muat ulang data');
  }
  await recordAssetEvent(tx, {
    assetId: asset.id,
    type: 'STATUS_CHANGED',
    fromStatus: asset.status,
    toStatus: to,
    note,
    actorId,
  });
}

/** Lepas item dari pick list: aset kembali AVAILABLE, item REMOVED, scan UNPICK tercatat. */
export async function releaseItem(
  tx: Tx,
  item: { id: string; assetId: string; pickListId: string },
  pick: { number: string; orderId: string },
  actorId: string | null,
  note: string,
): Promise<void> {
  const asset = await tx.asset.findUniqueOrThrow({ where: { id: item.assetId } });
  if (asset.status === 'RESERVED' || asset.status === 'PREPARED') {
    await moveAsset(tx, asset, 'AVAILABLE', actorId, `${note} (${pick.number})`);
  }
  await tx.pickListItem.update({ where: { id: item.id }, data: { status: 'REMOVED' } });
  await tx.scanEvent.create({
    data: {
      action: 'UNPICK',
      result: 'OK',
      method: 'MANUAL',
      pickListId: item.pickListId,
      orderId: pick.orderId,
      assetId: item.assetId,
      note,
      actorId,
    },
  });
}

/** Batalkan pick list yang belum keluar gudang dan lepas semua asetnya. */
export async function cancelPickList(
  tx: Tx,
  pickListId: string,
  actorId: string | null,
  note: string,
): Promise<number> {
  const pick = await tx.pickList.findUniqueOrThrow({ where: { id: pickListId } });
  const items = await tx.pickListItem.findMany({
    where: { pickListId, status: { in: ['PICKED', 'VERIFIED'] } },
  });
  for (const item of items) await releaseItem(tx, item, pick, actorId, note);
  await tx.pickList.update({ where: { id: pickListId }, data: { status: 'CANCELLED' } });
  return items.length;
}

// ---------- Dokumen serah-terima ----------

const PIC_COUNTERPART_ROLES = ['CUSTOMER_PIC', 'FIELD'] as const;

export async function buildPayload(
  tx: Tx,
  pickListId: string,
  type: HandoverType,
  actorName: string,
  note: string | null,
  now: Date,
): Promise<HandoverPayload> {
  const pick = await tx.pickList.findUniqueOrThrow({
    where: { id: pickListId },
    include: {
      order: { include: { customer: { select: { name: true } }, pics: true } },
      lines: { include: { product: { select: { name: true } } } },
      items: {
        where: { status: { not: 'REMOVED' } },
        include: {
          asset: { select: { code: true, serial: true } },
          product: { select: { name: true, ...sizeSelect } },
        },
        orderBy: { pickedAt: 'asc' },
      },
    },
  });
  const warehouseRole = type === 'OUT' ? 'WAREHOUSE_OUT' : 'WAREHOUSE_IN';
  const warehouse =
    pick.order.pics.find((p) => p.role === warehouseRole) ??
    pick.order.pics.find((p) => p.role === 'WAREHOUSE_OUT' || p.role === 'WAREHOUSE_IN');
  const dispatched = pick.items.filter((i) => i.dispatchedAt !== null);
  const items: HandoverItemSnapshot[] = dispatched
    .map((i) =>
      type === 'OUT'
        ? {
            assetCode: i.asset.code,
            productName: i.product.name,
            serial: i.asset.serial,
            condition: i.dispatchCondition,
            scannedAt: (i.dispatchedAt ?? i.verifiedAt)?.toISOString() ?? null,
            status: 'DISPATCHED' as const,
            note: i.extra ? 'Tambahan (include)' : null,
            extra: i.extra,
          }
        : {
            assetCode: i.asset.code,
            productName: i.product.name,
            serial: i.asset.serial,
            condition: i.returnCondition,
            scannedAt: i.returnedAt?.toISOString() ?? null,
            status: i.status,
            note: i.returnNote,
            extra: i.extra,
          },
    )
    .sort((a, b) => a.assetCode.localeCompare(b.assetCode));
  const returned = dispatched.filter((i) => i.status === 'RETURNED').length;
  return {
    type,
    orderNumber: pick.order.number,
    customerName: pick.order.customer.name,
    eventLocation: pick.order.eventLocation,
    startDate: isoDate(pick.order.startDate),
    endDate: isoDate(pick.order.endDate),
    pickListNumber: pick.number,
    performedBy: actorName,
    performedAt: now.toISOString(),
    warehousePic: warehouse
      ? { id: warehouse.id, name: warehouse.name, phone: warehouse.phone }
      : null,
    counterpartPics: pick.order.pics
      .filter((p) => (PIC_COUNTERPART_ROLES as readonly string[]).includes(p.role))
      .map((p) => ({ id: p.id, name: p.name, phone: p.phone, role: p.role })),
    lines: pick.lines
      .map((l) => ({ productName: l.product.name, quantity: l.quantity }))
      .sort((a, b) => a.productName.localeCompare(b.productName)),
    areaLines: pick.lines
      .filter((l) => l.areaPool)
      .map((l) => ({
        productName: l.product.name,
        orderedM2: l.quantity,
        packedM2:
          dispatched
            .filter((i) => i.product.areaPoolId === l.productId)
            .reduce((n, i) => n + (unitAreaCm2(i.product) ?? 0), 0) / CM2_PER_M2,
      }))
      .sort((a, b) => a.productName.localeCompare(b.productName)),
    countedLines: pick.lines
      .filter((l) => l.unlimited)
      .map((l) => {
        const packed = l.packedQty ?? 0;
        const returned = type === 'RETURN' ? l.returnedQty : null;
        return {
          productName: l.product.name,
          required: l.quantity,
          packed,
          returned,
          lost: returned === null ? null : packed - returned,
        };
      })
      .sort((a, b) => a.productName.localeCompare(b.productName)),
    items,
    summary:
      type === 'OUT'
        ? { expected: dispatched.length, returned: 0, missing: 0 }
        : { expected: dispatched.length, returned, missing: dispatched.length - returned },
    note,
  };
}

/** Buat dokumen baru (versi 1) atau revisi (nomor sama, versi berikutnya). Tidak pernah mengubah dokumen lama. */
export async function createHandoverDocument(
  tx: Tx,
  input: {
    pickListId: string;
    orderId: string;
    type: HandoverType;
    actor: { id: string; name: string };
    note?: string | null;
    revisionReason?: string | null;
  },
): Promise<{ id: string; number: string; version: number }> {
  const now = new Date();
  const previous = await tx.handoverDocument.findFirst({
    where: { pickListId: input.pickListId, type: input.type },
    orderBy: { version: 'desc' },
    select: { number: true, version: true },
  });
  const payload = await buildPayload(
    tx,
    input.pickListId,
    input.type,
    input.actor.name,
    input.revisionReason ?? input.note ?? null,
    now,
  );
  const number = previous?.number ?? (await nextDocumentNumber(tx, input.type, now));
  const version = (previous?.version ?? 0) + 1;
  const doc = await tx.handoverDocument.create({
    data: {
      number,
      version,
      type: input.type,
      orderId: input.orderId,
      pickListId: input.pickListId,
      payload: payload as unknown as Prisma.InputJsonValue,
      revisionReason: input.revisionReason ?? null,
      createdBy: input.actor.id,
    },
  });
  return { id: doc.id, number, version };
}

// ---------- Validasi file ----------

export function detectImageMime(buf: Buffer): 'image/png' | 'image/jpeg' | null {
  if (
    buf.length > 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}
