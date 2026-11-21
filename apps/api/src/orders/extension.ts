import type { Prisma, PrismaClient } from '@prisma/client';
import {
  EXTENDABLE_ORDER_STATUSES,
  eachDate,
  extensionDays,
  type OrderExtensionDto,
  type OrderExtensionPreviewDto,
} from '@eventra/shared';
import { HttpError } from '../errors';
import { issueExtensionInvoice } from '../finance/service';
import { lockOrderPickLists, userNames } from '../warehouse/service';
import {
  checkAvailability,
  insufficientStock,
  lockProducts,
  planItems,
  requirements,
} from './availability';
import { computeTotals, dateOnlyToDate, isoDate, recordStatus } from './service';

type Db = PrismaClient | Prisma.TransactionClient;
type Tx = Prisma.TransactionClient;

const addDay = (date: string): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

interface Plan {
  order: {
    id: string;
    number: string;
    status: string;
    endDate: Date;
    subtotal: bigint;
    pricingMode: 'LINE' | 'LUMP';
    lumpTotal: bigint | null;
    items: { productId: string; quantity: number; unitPrice: bigint }[];
  };
  previousEnd: string;
  newEnd: string;
  extraDays: number;
  /** Biaya tambahan; null = pesanan borongan tanpa nominal yang diisi. */
  amount: bigint | null;
  needsAmount: boolean;
}

/** Validasi aturan perpanjangan dan hitung biaya tambahan. Tidak menulis apa pun. */
async function buildPlan(
  db: Db,
  orderId: string,
  newEndDate: string,
  extraAmount: number | undefined,
): Promise<Plan> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      number: true,
      status: true,
      endDate: true,
      subtotal: true,
      pricingMode: true,
      lumpTotal: true,
      items: { select: { productId: true, quantity: true, unitPrice: true } },
    },
  });
  if (!order) throw new HttpError(404, 'NOT_FOUND', 'Pesanan tidak ditemukan');
  if (!(EXTENDABLE_ORDER_STATUSES as readonly string[]).includes(order.status)) {
    throw new HttpError(
      409,
      'ORDER_NOT_EXTENDABLE',
      `Pesanan berstatus ${order.status} tidak dapat diperpanjang`,
    );
  }
  const returned = await db.pickList.count({
    where: { orderId, status: { in: ['RETURNED', 'RETURN_ISSUE'] } },
  });
  if (returned > 0) {
    throw new HttpError(
      409,
      'ORDER_ALREADY_RETURNED',
      'Barang sudah dikembalikan; pesanan tidak dapat diperpanjang',
    );
  }
  const previousEnd = isoDate(order.endDate);
  const extraDays = extensionDays(previousEnd, newEndDate);
  if (extraDays <= 0) {
    throw new HttpError(
      400,
      'INVALID_EXTENSION_DATE',
      'Tanggal selesai baru harus lebih akhir dari tanggal selesai saat ini',
    );
  }
  const lump = order.pricingMode === 'LUMP';
  if (!lump && extraAmount != null) {
    throw new HttpError(
      400,
      'EXTRA_AMOUNT_NOT_ALLOWED',
      'Biaya perpanjangan dihitung otomatis dari harga per baris',
    );
  }
  const amount = lump
    ? extraAmount == null
      ? null
      : BigInt(extraAmount)
    : computeTotals(
        order.items.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice, unitDeposit: 0n })),
        extraDays,
      ).subtotal;
  return {
    order,
    previousEnd,
    newEnd: newEndDate,
    extraDays,
    amount,
    needsAmount: lump,
  };
}

const itemsOf = (p: Plan) =>
  p.order.items.map((i) => ({ productId: i.productId, quantity: i.quantity }));

/** Pratinjau perpanjangan: hari tambahan, biaya, dan kecukupan stok pada hari-hari tambahan. */
export async function previewExtension(
  db: Db,
  orderId: string,
  newEndDate: string,
  extraAmount: number | undefined,
  showPrices: boolean,
): Promise<OrderExtensionPreviewDto> {
  const plan = await buildPlan(db, orderId, newEndDate, extraAmount);
  const availability = await checkAvailability(
    db,
    itemsOf(plan),
    addDay(plan.previousEnd),
    plan.newEnd,
    { excludeOrderId: orderId },
  );
  return {
    previousEndDate: plan.previousEnd,
    newEndDate: plan.newEnd,
    extraDays: plan.extraDays,
    amount: showPrices && plan.amount != null ? Number(plan.amount) : null,
    needsAmount: plan.needsAmount,
    available: availability.ok,
    availability,
  };
}

/**
 * Terapkan perpanjangan secara atomik: kunci pick list dan produk, cek stok hanya untuk hari
 * tambahan (tidak boleh overbooking), buat alokasi CONFIRMED, geser tanggal selesai, tambah nilai
 * sewa, catat riwayat, dan terbitkan invoice tambahan terpisah. Invoice dan pembayaran lama tidak disentuh.
 */
export async function applyExtension(
  tx: Tx,
  orderId: string,
  input: { newEndDate: string; extraAmount?: number | undefined; note?: string | undefined },
  actorId: string,
  now: Date,
): Promise<{ extensionId: string; invoiceNumber: string | null }> {
  // Urutan kunci sama dengan scan/pembatalan: pick list dulu, lalu produk.
  await lockOrderPickLists(tx, orderId);
  const plan = await buildPlan(tx, orderId, input.newEndDate, input.extraAmount);
  if (plan.amount == null) {
    throw new HttpError(
      400,
      'EXTRA_AMOUNT_REQUIRED',
      'Pesanan borongan wajib mengisi biaya perpanjangan',
    );
  }
  const amount = plan.amount;
  const items = itemsOf(plan);
  const plans = await planItems(tx, items, { requireActive: true });
  const need = requirements(plans);
  await lockProducts(tx, [...need.keys()]);
  const firstNew = addDay(plan.previousEnd);
  const availability = await checkAvailability(tx, items, firstNew, plan.newEnd, {
    excludeOrderId: orderId,
    now,
  });
  if (!availability.ok) throw insufficientStock(availability);

  // Klaim bersyarat tanggal selesai lama: dua perpanjangan bersamaan tidak dapat sama-sama berhasil.
  const claimed = await tx.order.updateMany({
    where: { id: orderId, endDate: plan.order.endDate },
    data: {
      endDate: dateOnlyToDate(plan.newEnd),
      subtotal: plan.order.subtotal + amount,
      ...(plan.order.pricingMode === 'LUMP'
        ? { lumpTotal: (plan.order.lumpTotal ?? plan.order.subtotal) + amount }
        : {}),
    },
  });
  if (claimed.count === 0) {
    throw new HttpError(
      409,
      'ORDER_CHANGED',
      'Pesanan baru saja berubah; muat ulang lalu coba lagi',
    );
  }
  await tx.stockAllocation.createMany({
    data: [...need.entries()].flatMap(([productId, quantity]) =>
      eachDate(firstNew, plan.newEnd).map((d) => ({
        orderId,
        productId,
        date: dateOnlyToDate(d),
        quantity,
        status: 'CONFIRMED' as const,
        expiresAt: null,
      })),
    ),
  });
  const extension = await tx.orderExtension.create({
    data: {
      orderId,
      previousEndDate: plan.order.endDate,
      newEndDate: dateOnlyToDate(plan.newEnd),
      extraDays: plan.extraDays,
      amount,
      note: input.note ?? null,
      createdBy: actorId,
    },
  });
  const label = `Perpanjangan sewa ${plan.previousEnd} → ${plan.newEnd} (+${plan.extraDays} hari)`;
  const invoice = await issueExtensionInvoice(
    tx,
    {
      orderId,
      orderNumber: plan.order.number,
      amount,
      // Jatuh tempo: tanggal selesai lama, atau hari ini bila sudah lewat (tidak langsung terlambat).
      dueDate: dateOnlyToDate(
        plan.previousEnd > now.toISOString().slice(0, 10)
          ? plan.previousEnd
          : now.toISOString().slice(0, 10),
      ),
      note: label,
    },
    actorId,
  );
  if (invoice) {
    await tx.orderExtension.update({
      where: { id: extension.id },
      data: { invoiceId: invoice.id },
    });
  }
  await recordStatus(
    tx,
    orderId,
    plan.order.status as Parameters<typeof recordStatus>[3],
    plan.order.status as Parameters<typeof recordStatus>[3],
    actorId,
    input.note ? `${label}: ${input.note}` : label,
  );
  return { extensionId: extension.id, invoiceNumber: invoice?.number ?? null };
}

export async function listExtensions(
  db: Db,
  orderId: string,
  showPrices: boolean,
): Promise<OrderExtensionDto[]> {
  const rows = await db.orderExtension.findMany({
    where: { orderId },
    orderBy: { createdAt: 'asc' },
  });
  const invoiceIds = rows.map((r) => r.invoiceId).filter((v): v is string => v != null);
  const invoices = invoiceIds.length
    ? await db.invoice.findMany({
        where: { id: { in: invoiceIds } },
        select: { id: true, number: true },
      })
    : [];
  const numbers = new Map(invoices.map((i) => [i.id, i.number]));
  const names = await userNames(
    db,
    rows.map((r) => r.createdBy).filter((v): v is string => v != null),
  );
  return rows.map((r) => ({
    id: r.id,
    orderId: r.orderId,
    previousEndDate: isoDate(r.previousEndDate),
    newEndDate: isoDate(r.newEndDate),
    extraDays: r.extraDays,
    amount: showPrices ? Number(r.amount) : null,
    invoiceId: r.invoiceId,
    invoiceNumber: r.invoiceId ? (numbers.get(r.invoiceId) ?? null) : null,
    note: r.note,
    createdByName: r.createdBy ? (names.get(r.createdBy) ?? null) : null,
    createdAt: r.createdAt.toISOString(),
  }));
}
