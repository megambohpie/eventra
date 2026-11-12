import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import {
  ASSET_STATUSES,
  OPEN_INCIDENT_STATUSES,
  dashboardQuerySchema,
  hasCapability,
  rentalDays,
  type AssetMetricsDto,
  type AssetRankDto,
  type AssetStatus,
  type OwnerDashboardDto,
  type StaleAssetDto,
} from '@eventra/shared';
import { currentUser, requireCapability } from '../auth/middleware';
import { HttpError } from '../errors';
import { parseId } from '../http';
import { isoDay } from '../finance/service';

const DAY_MS = 86_400_000;
const STALE_LIST_LIMIT = 10;
const RANK_LIMIT = 5;

interface StaleRow {
  id: string;
  code: string;
  product_name: string;
  status: string;
  condition: string;
  last_update: Date;
  total: bigint;
}

interface RankRow {
  asset_id: string;
  code: string;
  product_name: string;
  n: bigint;
}

const toRank = (rows: RankRow[]): AssetRankDto[] =>
  rows.map((r) => ({
    assetId: r.asset_id,
    code: r.code,
    productName: r.product_name,
    count: Number(r.n),
  }));

export function dashboardsRouter(db: PrismaClient): Router {
  const router = Router();

  /**
   * Kesehatan aset untuk owner: sebaran status, aset rusak, aset tanpa pembaruan (tanpa perubahan status/
   * kondisi/lokasi selama N hari), insiden/servis terbuka, serta aset paling sering disewa dan rusak.
   * Pergerakan barang per tanggal memakai `/calendar` dan `/calendar/day` (drill-down pesanan, jumlah,
   * lokasi, PIC).
   */
  router.get('/dashboards/owner', requireCapability('dashboard.read'), async (req, res) => {
    const { staleDays } = dashboardQuerySchema.parse(req.query);
    const now = new Date();
    const cutoff = new Date(now.getTime() - staleDays * DAY_MS);

    const [grouped, damaged, stale, openIncidents, openTickets, rented, brokenRows] =
      await Promise.all([
        db.asset.groupBy({ by: ['status'], _count: { _all: true } }),
        db.asset.count({ where: { condition: 'DAMAGED', status: { not: 'RETIRED' } } }),
        db.$queryRaw<StaleRow[]>`
          SELECT a.id, a.code, p.name AS product_name, a.status::text AS status,
                 a.condition::text AS condition,
                 GREATEST(a.updated_at, COALESCE(MAX(e.created_at), a.updated_at)) AS last_update,
                 COUNT(*) OVER() AS total
          FROM assets a
          JOIN products p ON p.id = a.product_id
          LEFT JOIN asset_status_events e ON e.asset_id = a.id
          WHERE a.status <> 'RETIRED'
          GROUP BY a.id, p.name
          HAVING GREATEST(a.updated_at, COALESCE(MAX(e.created_at), a.updated_at)) < ${cutoff}
          ORDER BY last_update ASC
          LIMIT ${STALE_LIST_LIMIT}`,
        db.incident.count({ where: { status: { in: [...OPEN_INCIDENT_STATUSES] } } }),
        db.serviceTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
        db.$queryRaw<RankRow[]>`
          SELECT a.id AS asset_id, a.code, p.name AS product_name,
                 COUNT(DISTINCT pl.order_id) AS n
          FROM pick_list_items i
          JOIN pick_lists pl ON pl.id = i.pick_list_id
          JOIN assets a ON a.id = i.asset_id
          JOIN products p ON p.id = a.product_id
          WHERE i.dispatched_at IS NOT NULL
          GROUP BY a.id, p.name
          ORDER BY n DESC, a.code ASC
          LIMIT ${RANK_LIMIT}`,
        db.$queryRaw<RankRow[]>`
          SELECT a.id AS asset_id, a.code, p.name AS product_name, COUNT(*) AS n
          FROM incidents i
          JOIN assets a ON a.id = i.asset_id
          JOIN products p ON p.id = a.product_id
          WHERE i.status NOT IN ('DRAFT', 'REJECTED')
          GROUP BY a.id, p.name
          ORDER BY n DESC, a.code ASC
          LIMIT ${RANK_LIMIT}`,
      ]);

    const byStatus = Object.fromEntries(ASSET_STATUSES.map((s) => [s, 0])) as Record<
      AssetStatus,
      number
    >;
    for (const g of grouped) byStatus[g.status] = g._count._all;
    const staleAssets: StaleAssetDto[] = stale.map((r) => ({
      assetId: r.id,
      code: r.code,
      productName: r.product_name,
      status: r.status as StaleAssetDto['status'],
      condition: r.condition as StaleAssetDto['condition'],
      lastUpdateAt: r.last_update.toISOString(),
      daysSince: Math.floor((now.getTime() - r.last_update.getTime()) / DAY_MS),
    }));
    const data: OwnerDashboardDto = {
      generatedAt: now.toISOString(),
      staleDays,
      totalAssets: Object.values(byStatus).reduce((n, c) => n + c, 0),
      byStatus,
      damaged,
      staleCount: stale.length > 0 ? Number(stale[0]?.total ?? 0) : 0,
      staleAssets,
      openIncidents,
      openServiceTickets: openTickets,
      mostRented: toRank(rented),
      mostDamaged: toRank(brokenRows),
    };
    res.json({ data });
  });

  /** Ringkasan umur pakai aset: umur, harga beli, sewa, hari pakai, servis, dan insiden. */
  router.get('/assets/:id/metrics', requireCapability('asset.read'), async (req, res) => {
    const id = parseId(req.params.id);
    const withCost = hasCapability(currentUser(req).role, 'asset.cost.read');
    const asset = await db.asset.findUnique({ where: { id } });
    if (!asset) throw new HttpError(404, 'NOT_FOUND', 'Aset tidak ditemukan');
    const [items, tickets, incidentCount] = await Promise.all([
      db.pickListItem.findMany({
        where: { assetId: id, dispatchedAt: { not: null } },
        select: {
          pickList: { select: { order: { select: { id: true, startDate: true, endDate: true } } } },
        },
      }),
      db.serviceTicket.findMany({
        where: { assetId: id, status: { not: 'CANCELLED' } },
        select: { cost: true },
      }),
      db.incident.count({ where: { assetId: id, status: { notIn: ['DRAFT', 'REJECTED'] } } }),
    ]);
    const orders = new Map(items.map((i) => [i.pickList.order.id, i.pickList.order]));
    const since = asset.purchaseDate ?? asset.createdAt;
    const data: AssetMetricsDto = {
      assetId: id,
      ageDays: Math.max(0, Math.floor((Date.now() - since.getTime()) / DAY_MS)),
      purchaseDate: asset.purchaseDate ? isoDay(asset.purchaseDate) : null,
      purchasePrice: withCost && asset.purchasePrice !== null ? Number(asset.purchasePrice) : null,
      rentalCount: orders.size,
      rentalDays: [...orders.values()].reduce(
        (n, o) => n + rentalDays(isoDay(o.startDate), isoDay(o.endDate)),
        0,
      ),
      serviceCount: tickets.length,
      serviceCost: withCost ? tickets.reduce((n, t) => n + Number(t.cost ?? 0n), 0) : null,
      incidentCount,
    };
    res.json({ data });
  });

  return router;
}
