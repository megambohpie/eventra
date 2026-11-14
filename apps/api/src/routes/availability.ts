import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { availabilityCalendarQuerySchema, availabilityCheckSchema } from '@eventra/shared';
import { requireCapability } from '../auth/middleware';
import { HttpError } from '../errors';
import { availabilityCalendar, checkAvailability, planItems } from '../orders/availability';

export function availabilityRouter(db: PrismaClient): Router {
  const router = Router();

  /** Cek ketersediaan per tanggal + kuantitas maksimum (tidak mengunci/mengalokasikan stok). */
  router.post('/availability/check', requireCapability('availability.read'), async (req, res) => {
    const input = availabilityCheckSchema.parse(req.body);
    const data = await checkAvailability(db, input.items, input.startDate, input.endDate, {
      excludeOrderId: input.excludeOrderId,
    });
    res.json({ data });
  });

  /**
   * Kalender stok harian per produk fisik: total, terkonfirmasi, hold aktif, sisa.
   * `productId` produk paket diperluas menjadi komponen fisiknya.
   */
  router.get('/availability/calendar', requireCapability('availability.read'), async (req, res) => {
    const q = availabilityCalendarQuerySchema.parse(req.query);
    let productIds: string[];
    if (q.productId) {
      const [plan] = await planItems(db, [{ productId: q.productId, quantity: 1 }]);
      if (!plan) throw new HttpError(404, 'NOT_FOUND', 'Produk tidak ditemukan');
      productIds = plan.components.map((c) => c.productId);
    } else {
      const rows = await db.asset.groupBy({
        by: ['productId'],
        orderBy: { productId: 'asc' },
        take: 200,
      });
      // Kabinet anggota kelompok "per meter" dihitung pada produk kelompoknya (dalam m²).
      const owners = await db.product.findMany({
        where: { id: { in: rows.map((r) => r.productId) } },
        select: { id: true, areaPoolId: true },
      });
      productIds = [...new Set(owners.map((o) => o.areaPoolId ?? o.id))];
    }
    res.json({ data: await availabilityCalendar(db, productIds, q.from, q.to) });
  });

  return router;
}
