import type { Prisma, PrismaClient } from '@prisma/client';
import {
  NON_ALLOCATABLE_STATUSES,
  eachDate,
  type AvailabilityDayDto,
  type AvailabilityResultDto,
  type ItemAvailabilityDto,
} from '@eventra/shared';
import { HttpError } from '../errors';
import { dateOnlyToDate } from '../assets/service';

type Db = PrismaClient | Prisma.TransactionClient;
type Tx = Prisma.TransactionClient;

export interface PlanComponent {
  productId: string;
  productName: string;
  /** Aset fisik per 1 satuan sewa. */
  perUnit: number;
}

export interface ItemPlan {
  productId: string;
  productName: string;
  unitLabel: string;
  quantity: number;
  components: PlanComponent[];
}

export interface RequestItem {
  productId: string;
  quantity: number;
}

/**
 * Konversi satuan sewa → aset fisik (TECHNICAL_SPEC §6). Produk tanpa aturan paket dipenuhi
 * asetnya sendiri (rasio 1). Hanya satu tingkat; paket bersarang ditolak saat konfigurasi.
 */
export async function planItems(
  db: Db,
  items: RequestItem[],
  opts: { requireActive?: boolean } = {},
): Promise<ItemPlan[]> {
  const ids = [...new Set(items.map((i) => i.productId))];
  const products = await db.product.findMany({
    where: { id: { in: ids } },
    include: { bundleOf: { include: { component: { select: { id: true, name: true } } } } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  return items.map((item) => {
    const product = byId.get(item.productId);
    if (!product) {
      throw new HttpError(400, 'INVALID_REFERENCE', 'Produk pada item tidak ditemukan');
    }
    if (opts.requireActive && !product.active) {
      throw new HttpError(409, 'PRODUCT_INACTIVE', `Produk ${product.name} nonaktif`);
    }
    const components: PlanComponent[] =
      product.bundleOf.length > 0
        ? product.bundleOf.map((b) => ({
            productId: b.component.id,
            productName: b.component.name,
            perUnit: b.quantity,
          }))
        : [{ productId: product.id, productName: product.name, perUnit: 1 }];
    return {
      productId: product.id,
      productName: product.name,
      unitLabel: product.unitLabel,
      quantity: item.quantity,
      components,
    };
  });
}

/** Total aset fisik yang dibutuhkan per produk pemenuhan, per hari. */
export function requirements(plans: ItemPlan[]): Map<string, number> {
  const need = new Map<string, number>();
  for (const plan of plans) {
    for (const c of plan.components) {
      need.set(c.productId, (need.get(c.productId) ?? 0) + plan.quantity * c.perUnit);
    }
  }
  return need;
}

/** Stok total = aset yang boleh dialokasikan (bukan servis/karantina/pensiun/masalah). */
export async function stockTotals(db: Db, productIds: string[]): Promise<Map<string, number>> {
  const rows = await db.asset.groupBy({
    by: ['productId'],
    where: { productId: { in: productIds }, status: { notIn: [...NON_ALLOCATABLE_STATUSES] } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.productId, r._count._all]));
}

export interface DayUsage {
  confirmed: number;
  held: number;
}

/** Pemakaian per produk per tanggal; hold kadaluarsa tidak dihitung (langsung bebas). */
export async function allocationUsage(
  db: Db,
  productIds: string[],
  start: string,
  end: string,
  now: Date,
  excludeOrderId?: string,
): Promise<Map<string, Map<string, DayUsage>>> {
  const rows = await db.stockAllocation.groupBy({
    by: ['productId', 'date', 'status'],
    where: {
      productId: { in: productIds },
      date: { gte: dateOnlyToDate(start), lte: dateOnlyToDate(end) },
      ...(excludeOrderId ? { orderId: { not: excludeOrderId } } : {}),
      OR: [{ status: 'CONFIRMED' }, { status: 'HOLD', expiresAt: { gt: now } }],
    },
    _sum: { quantity: true },
  });
  const usage = new Map<string, Map<string, DayUsage>>();
  for (const r of rows) {
    const day = r.date.toISOString().slice(0, 10);
    const perProduct = usage.get(r.productId) ?? new Map<string, DayUsage>();
    const cur = perProduct.get(day) ?? { confirmed: 0, held: 0 };
    if (r.status === 'CONFIRMED') cur.confirmed += r._sum.quantity ?? 0;
    else cur.held += r._sum.quantity ?? 0;
    perProduct.set(day, cur);
    usage.set(r.productId, perProduct);
  }
  return usage;
}

/** Kunci baris produk (urut id) agar hitung-lalu-alokasi per produk bersifat serial dan bebas deadlock. */
export async function lockProducts(tx: Tx, productIds: string[]): Promise<void> {
  const ids = [...new Set(productIds)].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT id FROM products WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;
}

export async function checkAvailability(
  db: Db,
  items: RequestItem[],
  start: string,
  end: string,
  opts: { excludeOrderId?: string; now?: Date } = {},
): Promise<AvailabilityResultDto> {
  const now = opts.now ?? new Date();
  const plans = await planItems(db, items);
  const need = requirements(plans);
  const physical = [...need.keys()];
  const totals = await stockTotals(db, physical);
  const usage = await allocationUsage(db, physical, start, end, now, opts.excludeOrderId);
  const dates = eachDate(start, end);

  const minRemaining = new Map<string, number>();
  for (const pid of physical) {
    let min = Number.POSITIVE_INFINITY;
    for (const d of dates) {
      const u = usage.get(pid)?.get(d);
      min = Math.min(min, (totals.get(pid) ?? 0) - (u?.confirmed ?? 0) - (u?.held ?? 0));
    }
    minRemaining.set(pid, Math.max(0, min));
  }

  const result: ItemAvailabilityDto[] = plans.map((plan) => {
    const components = plan.components.map((c) => {
      const required = plan.quantity * c.perUnit;
      const others = (need.get(c.productId) ?? 0) - required;
      const free = (minRemaining.get(c.productId) ?? 0) - others;
      return {
        c,
        dto: {
          productId: c.productId,
          productName: c.productName,
          required,
          minRemaining: minRemaining.get(c.productId) ?? 0,
          total: totals.get(c.productId) ?? 0,
        },
        maxUnits: Math.max(0, Math.floor(free / c.perUnit)),
      };
    });
    const maxQuantity = Math.min(...components.map((x) => x.maxUnits));
    return {
      productId: plan.productId,
      productName: plan.productName,
      requested: plan.quantity,
      maxQuantity,
      available: plan.quantity <= maxQuantity,
      components: components.map((x) => x.dto),
    };
  });

  return { startDate: start, endDate: end, ok: result.every((i) => i.available), items: result };
}

export function insufficientStock(result: AvailabilityResultDto): HttpError {
  const short = result.items
    .filter((i) => !i.available)
    .map((i) => `${i.productName} (diminta ${i.requested}, maks ${i.maxQuantity})`);
  return new HttpError(409, 'INSUFFICIENT_STOCK', `Stok tidak mencukupi: ${short.join('; ')}`, {
    items: short,
  });
}

/**
 * Alokasi atomik. Pemanggil harus berada di dalam transaksi. Produk dikunci, ketersediaan dihitung
 * ulang (tanpa alokasi pesanan ini), lalu seluruh tanggal dialokasikan; bila ada tanggal yang kurang,
 * error dilempar dan transaksi dibatalkan seluruhnya.
 */
export async function allocateOrder(
  tx: Tx,
  order: { id: string; startDate: string; endDate: string },
  items: RequestItem[],
  mode: { status: 'HOLD'; expiresAt: Date } | { status: 'CONFIRMED' },
  now: Date,
): Promise<void> {
  const plans = await planItems(tx, items, { requireActive: true });
  const need = requirements(plans);
  await lockProducts(tx, [...need.keys()]);
  const result = await checkAvailability(tx, items, order.startDate, order.endDate, {
    excludeOrderId: order.id,
    now,
  });
  if (!result.ok) throw insufficientStock(result);

  await releaseAllocations(tx, order.id, now);
  const dates = eachDate(order.startDate, order.endDate);
  await tx.stockAllocation.createMany({
    data: [...need.entries()].flatMap(([productId, quantity]) =>
      dates.map((d) => ({
        orderId: order.id,
        productId,
        date: dateOnlyToDate(d),
        quantity,
        status: mode.status,
        expiresAt: mode.status === 'HOLD' ? mode.expiresAt : null,
      })),
    ),
  });
}

/** Lepas semua alokasi aktif pesanan (riwayat tetap tersimpan sebagai RELEASED). */
export async function releaseAllocations(tx: Tx, orderId: string, now: Date): Promise<number> {
  const { count } = await tx.stockAllocation.updateMany({
    where: { orderId, status: { in: ['HOLD', 'CONFIRMED'] } },
    data: { status: 'RELEASED', releasedAt: now },
  });
  return count;
}

/** Kalender stok per produk fisik per tanggal. */
export async function availabilityCalendar(
  db: Db,
  productIds: string[],
  from: string,
  to: string,
  now = new Date(),
): Promise<AvailabilityDayDto[]> {
  if (productIds.length === 0) return [];
  const [products, totals, usage] = await Promise.all([
    db.product.findMany({ where: { id: { in: productIds } }, orderBy: { name: 'asc' } }),
    stockTotals(db, productIds),
    allocationUsage(db, productIds, from, to, now),
  ]);
  const dates = eachDate(from, to);
  return products.flatMap((p) =>
    dates.map((date) => {
      const total = totals.get(p.id) ?? 0;
      const u = usage.get(p.id)?.get(date);
      const confirmed = u?.confirmed ?? 0;
      const held = u?.held ?? 0;
      return {
        date,
        productId: p.id,
        productName: p.name,
        total,
        confirmed,
        held,
        remaining: Math.max(0, total - confirmed - held),
      };
    }),
  );
}
