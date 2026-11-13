import type { OrderStatus as DbOrderStatus, Prisma, PrismaClient } from '@prisma/client';
import {
  rentalDays,
  type OrderDto,
  type OrderPicDto,
  type OrderStatus,
  type OrderSummaryDto,
} from '@eventra/shared';
import { HttpError } from '../errors';
import { dateOnlyToDate } from '../assets/service';
import { planItems, releaseAllocations } from './availability';

type Db = PrismaClient | Prisma.TransactionClient;
type Tx = Prisma.TransactionClient;

export const orderInclude = {
  customer: { select: { id: true, name: true } },
  items: { orderBy: { id: 'asc' } },
  pics: { orderBy: [{ role: 'asc' }, { createdAt: 'asc' }] },
  quotes: { orderBy: { version: 'desc' } },
  events: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
type SummaryRow = Prisma.OrderGetPayload<{ include: { customer: { select: { name: true } } } }>;

export const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

export function toSummaryDto(o: SummaryRow): OrderSummaryDto {
  const startDate = isoDate(o.startDate);
  const endDate = isoDate(o.endDate);
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    customerId: o.customerId,
    customerName: o.customer.name,
    startDate,
    endDate,
    days: rentalDays(startDate, endDate),
    eventLocation: o.eventLocation,
    subtotal: Number(o.subtotal),
    depositTotal: Number(o.depositTotal),
    holdExpiresAt: o.holdExpiresAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
  };
}

type PicRow = OrderRow['pics'][number];

export const toPicDto = (p: PicRow, approverNames: Map<string, string>): OrderPicDto => ({
  id: p.id,
  role: p.role,
  source: p.source,
  userId: p.userId,
  name: p.name,
  phone: p.phone,
  organization: p.organization,
  authorization: p.authorization,
  approvedBy: p.approvedById ? (approverNames.get(p.approvedById) ?? null) : null,
  approvedAt: p.approvedAt?.toISOString() ?? null,
  createdAt: p.createdAt.toISOString(),
});

export async function loadOrder(db: Db, id: string): Promise<OrderRow> {
  const order = await db.order.findUnique({ where: { id }, include: orderInclude });
  if (!order) throw new HttpError(404, 'NOT_FOUND', 'Pesanan tidak ditemukan');
  return order;
}

export async function toOrderDto(db: Db, o: OrderRow): Promise<OrderDto> {
  const plans = await planItems(
    db,
    o.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
  );
  const planById = new Map(plans.map((p) => [p.productId, p]));
  const userIds = [
    ...new Set([
      ...o.pics.flatMap((p) => (p.approvedById ? [p.approvedById] : [])),
      ...o.quotes.flatMap((q) => (q.createdBy ? [q.createdBy] : [])),
      ...o.events.flatMap((e) => (e.actorId ? [e.actorId] : [])),
    ]),
  ];
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  });
  const names = new Map(users.map((u) => [u.id, u.name]));

  return {
    ...toSummaryDto(o),
    eventAddress: o.eventAddress,
    eventLat: o.eventLat,
    eventLng: o.eventLng,
    note: o.note,
    confirmedAt: o.confirmedAt?.toISOString() ?? null,
    items: o.items.map((i) => {
      const plan = planById.get(i.productId);
      const unitPrice = Number(i.unitPrice);
      const unitDeposit = Number(i.unitDeposit);
      const days = rentalDays(isoDate(o.startDate), isoDate(o.endDate));
      return {
        id: i.id,
        productId: i.productId,
        productName: plan?.productName ?? '',
        unitLabel: plan?.unitLabel ?? '',
        quantity: i.quantity,
        unitPrice,
        unitDeposit,
        lineTotal: unitPrice * i.quantity * days,
        lineDeposit: unitDeposit * i.quantity,
        components: (plan?.components ?? []).map((c) => ({
          productId: c.productId,
          productName: c.productName,
          perUnit: c.perUnit,
          required: c.perUnit * i.quantity,
        })),
      };
    }),
    pics: o.pics.map((p) => toPicDto(p, names)),
    quotes: o.quotes.map((q) => ({
      id: q.id,
      version: q.version,
      subtotal: Number(q.subtotal),
      depositTotal: Number(q.depositTotal),
      note: q.note,
      createdBy: q.createdBy ? (names.get(q.createdBy) ?? null) : null,
      createdAt: q.createdAt.toISOString(),
    })),
    history: o.events.map((e) => ({
      id: e.id,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      note: e.note,
      actor: e.actorId ? (names.get(e.actorId) ?? null) : null,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

/** Subtotal sewa = harga × qty × hari; deposit tidak dikalikan hari. */
export function computeTotals(
  items: { quantity: number; unitPrice: bigint; unitDeposit: bigint }[],
  days: number,
): { subtotal: bigint; depositTotal: bigint } {
  let subtotal = 0n;
  let depositTotal = 0n;
  for (const i of items) {
    subtotal += i.unitPrice * BigInt(i.quantity) * BigInt(days);
    depositTotal += i.unitDeposit * BigInt(i.quantity);
  }
  return { subtotal, depositTotal };
}

export async function nextOrderNumber(tx: Tx, date: Date): Promise<string> {
  const rows = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_number_seq') AS n`;
  return `ORD-${date.getUTCFullYear()}-${String(rows[0]?.n ?? 0).padStart(6, '0')}`;
}

export async function recordStatus(
  tx: Tx,
  orderId: string,
  from: OrderStatus | null,
  to: OrderStatus,
  actorId: string | null,
  note?: string | null,
): Promise<void> {
  await tx.orderStatusEvent.create({
    data: { orderId, fromStatus: from, toStatus: to, actorId, note: note ?? null },
  });
}

/**
 * Pindah status secara atomik: klaim dengan updateMany bersyarat status asal sehingga dua permintaan
 * bersamaan tidak dapat sama-sama berhasil.
 */
export async function claimTransition(
  tx: Tx,
  id: string,
  from: readonly OrderStatus[],
  to: OrderStatus,
  data: Prisma.OrderUpdateManyMutationInput = {},
): Promise<OrderStatus> {
  const current = await tx.order.findUnique({ where: { id }, select: { status: true } });
  if (!current) throw new HttpError(404, 'NOT_FOUND', 'Pesanan tidak ditemukan');
  const claimed = await tx.order.updateMany({
    where: { id, status: { in: from as DbOrderStatus[] } },
    data: { ...data, status: to },
  });
  if (claimed.count === 0) {
    throw new HttpError(
      409,
      'INVALID_ORDER_STATE',
      `Pesanan berstatus ${current.status} tidak dapat dipindahkan ke ${to}`,
    );
  }
  return current.status;
}

/** Kadaluarsakan satu pesanan bila hold-nya sudah lewat; mengembalikan true bila kadaluarsa. */
async function expireOne(db: PrismaClient, id: string, now: Date): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: { id, status: 'AWAITING_PAYMENT', holdExpiresAt: { lte: now } },
      data: { status: 'EXPIRED' },
    });
    if (claimed.count === 0) return false;
    await releaseAllocations(tx, id, now);
    await recordStatus(tx, id, 'AWAITING_PAYMENT', 'EXPIRED', null, 'Hold pembayaran kadaluarsa');
    await tx.auditLog.create({
      data: {
        action: 'order.expire',
        entity: 'order',
        entityId: id,
        before: { status: 'AWAITING_PAYMENT' },
        after: { status: 'EXPIRED' },
      },
    });
    return true;
  });
}

/** Job hold expiry: melepaskan stok pesanan yang hold-nya kadaluarsa. Aman dipanggil berulang. */
export async function expireHolds(db: PrismaClient, now = new Date()): Promise<number> {
  const due = await db.order.findMany({
    where: { status: 'AWAITING_PAYMENT', holdExpiresAt: { lte: now } },
    select: { id: true },
  });
  let expired = 0;
  for (const { id } of due) {
    if (await expireOne(db, id, now)) expired += 1;
  }
  return expired;
}

export const expireOrderIfDue = (db: PrismaClient, id: string, now = new Date()) =>
  expireOne(db, id, now);

export { dateOnlyToDate };
