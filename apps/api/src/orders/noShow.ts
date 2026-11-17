import type { Prisma, PrismaClient } from '@prisma/client';
import { HttpError } from '../errors';
import { cancelPickList, lockOrderPickLists } from '../warehouse/service';
import { releaseAllocations } from './availability';
import { claimTransition, recordStatus } from './service';

/** Zona waktu bisnis: WIB (UTC+7). Hari sewa pertama berakhir pukul 24:00 WIB. */
const WIB_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 24 * 3_600_000;

/**
 * Batas barang keluar gudang: akhir hari sewa pertama (24:00 WIB). `startDate` adalah tanggal murni
 * (UTC 00:00), sehingga batas = tanggal + 24 jam − 7 jam. Setelah batas ini pesanan dianggap tidak diambil.
 */
export const pickupDeadline = (startDate: Date): Date =>
  new Date(startDate.getTime() + DAY_MS - WIB_OFFSET_MS);

export const pickupDeadlinePassed = (startDate: Date, now = new Date()): boolean =>
  now.getTime() >= pickupDeadline(startDate).getTime();

export const NO_SHOW_NOTE =
  'Barang tidak keluar sampai batas (akhir hari sewa pertama); pesanan batal otomatis, deposit hangus';

/**
 * Batalkan pesanan tidak diambil: stok dilepas, pick list aktif dibatalkan (aset kembali tersedia),
 * `noShowAt` dicatat sehingga deposit tidak dapat diminta kembali. Atomik dan aman dipanggil
 * berulang; mengembalikan true hanya bila pesanan benar-benar dibatalkan oleh pemanggilan ini.
 */
export async function markNoShow(db: PrismaClient, id: string, now = new Date()): Promise<boolean> {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const order = await tx.order.findUnique({
      where: { id },
      select: { status: true, startDate: true },
    });
    if (
      !order ||
      (order.status !== 'CONFIRMED' && order.status !== 'SCHEDULED') ||
      !pickupDeadlinePassed(order.startDate, now)
    ) {
      return false;
    }
    await lockOrderPickLists(tx, id);
    let from;
    try {
      from = await claimTransition(tx, id, ['CONFIRMED', 'SCHEDULED'], 'CANCELLED', {
        noShowAt: now,
        holdExpiresAt: null,
      });
    } catch (err) {
      if (err instanceof HttpError && err.status === 409) return false; // sudah berpindah status
      throw err;
    }
    const released = await releaseAllocations(tx, id, now);
    const picks = await tx.pickList.findMany({
      where: { orderId: id, status: { in: ['OPEN', 'VERIFIED'] } },
      select: { id: true },
    });
    for (const p of picks) await cancelPickList(tx, p.id, null, 'Pesanan tidak diambil');
    await recordStatus(tx, id, from, 'CANCELLED', null, NO_SHOW_NOTE);
    await tx.auditLog.create({
      data: {
        action: 'order.no_show',
        entity: 'order',
        entityId: id,
        before: { status: from },
        after: { status: 'CANCELLED', noShowAt: now.toISOString(), releasedAllocations: released },
      },
    });
    return true;
  });
}

/** Job: batalkan semua pesanan terkonfirmasi/terjadwal yang batas keluarnya sudah lewat. */
export async function expireNoShows(db: PrismaClient, now = new Date()): Promise<number> {
  // startDate + 24 jam − 7 jam ≤ sekarang  ⇔  startDate ≤ sekarang − 17 jam.
  const cutoff = new Date(now.getTime() - (DAY_MS - WIB_OFFSET_MS));
  const due = await db.order.findMany({
    where: { status: { in: ['CONFIRMED', 'SCHEDULED'] }, startDate: { lte: cutoff } },
    select: { id: true },
  });
  let count = 0;
  for (const { id } of due) if (await markNoShow(db, id, now)) count += 1;
  return count;
}

/**
 * Gerbang gudang: bila batas keluar sudah lewat, pesanan dibatalkan (no-show) lebih dulu lalu aksi
 * ditolak. Dipanggil sebelum membuat pick list, scan, hitung, dan checkout.
 */
export async function enforcePickupDeadline(
  db: PrismaClient,
  orderId: string,
  now = new Date(),
): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { status: true, startDate: true, noShowAt: true },
  });
  if (!order) return;
  if (order.noShowAt) {
    throw new HttpError(
      409,
      'PICKUP_DEADLINE_PASSED',
      'Pesanan batal karena barang tidak keluar sampai batas; gudang tidak dapat menyiapkan barang',
    );
  }
  if (
    (order.status === 'CONFIRMED' || order.status === 'SCHEDULED') &&
    pickupDeadlinePassed(order.startDate, now)
  ) {
    await markNoShow(db, orderId, now);
    throw new HttpError(
      409,
      'PICKUP_DEADLINE_PASSED',
      'Batas barang keluar (akhir hari sewa pertama) sudah lewat; pesanan dibatalkan dan gudang tidak dapat menyiapkan barang',
    );
  }
}
