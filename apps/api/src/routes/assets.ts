import { Router } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  ATTENTION_CONDITIONS,
  ATTENTION_STATUSES,
  MANUAL_STATUS_TRANSITIONS,
  assetConditionChangeSchema,
  assetCreateSchema,
  assetListQuerySchema,
  assetStatusChangeSchema,
  assetUpdateSchema,
  hasCapability,
  labelIdsSchema,
  type AssetDto,
  type AssetEventDto,
  type AssetScanDto,
  type AssetSummaryDto,
  type Page,
} from '@eventra/shared';
import { writeAudit } from '../audit';
import { currentUser, requireCapability } from '../auth/middleware';
import { HttpError } from '../errors';
import { parseId } from '../http';
import { buildLabelsPdf, qrPng } from '../assets/labels';
import { assertClearable } from '../incidents/service';
import {
  QR_TOKEN_PATTERN,
  assetInclude,
  dateOnlyToDate,
  eventInclude,
  initialStatus,
  newQrToken,
  nextAssetCodes,
  toAssetDto,
  toEventDto,
  toScanDto,
} from '../assets/service';

const ATTENTION_WHERE: Prisma.AssetWhereInput = {
  OR: [
    { condition: { in: [...ATTENTION_CONDITIONS] } },
    { status: { in: [...ATTENTION_STATUSES] } },
  ],
};

export function assetsRouter(db: PrismaClient): Router {
  const router = Router();
  const canSeeCost = (req: Parameters<typeof currentUser>[0]) =>
    hasCapability(currentUser(req).role, 'asset.cost.read');

  const loadAsset = async (id: string) => {
    const asset = await db.asset.findUnique({ where: { id }, include: assetInclude });
    if (!asset) throw new HttpError(404, 'NOT_FOUND', 'Aset tidak ditemukan');
    return asset;
  };

  // ---- Rute statis harus didaftarkan sebelum /assets/:id ----

  router.get('/assets/summary', requireCapability('asset.read'), async (_req, res) => {
    const [total, attention, byStatus, byCondition] = await Promise.all([
      db.asset.count(),
      db.asset.count({ where: ATTENTION_WHERE }),
      db.asset.groupBy({ by: ['status'], _count: { _all: true } }),
      db.asset.groupBy({ by: ['condition'], _count: { _all: true } }),
    ]);
    const data: AssetSummaryDto = {
      total,
      attention,
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
      byCondition: Object.fromEntries(byCondition.map((r) => [r.condition, r._count._all])),
    };
    res.json({ data });
  });

  router.get('/assets/labels.pdf', requireCapability('asset.read'), async (req, res) => {
    const ids = labelIdsSchema.parse(req.query.ids);
    const assets = await db.asset.findMany({
      where: { id: { in: ids } },
      include: { product: { select: { name: true } } },
    });
    const byId = new Map(assets.map((a) => [a.id, a]));
    const ordered = ids.map((id) => byId.get(id));
    if (ordered.some((a) => !a)) throw new HttpError(404, 'NOT_FOUND', 'Aset tidak ditemukan');
    const pdf = await buildLabelsPdf(
      ordered.flatMap((a) =>
        a
          ? [{ code: a.code, qrToken: a.qrToken, productName: a.product.name, serial: a.serial }]
          : [],
      ),
    );
    await writeAudit(db, req, {
      action: 'asset.labels.print',
      entity: 'asset',
      after: { count: ids.length },
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="eventra-qr-labels.pdf"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdf);
  });

  /** Scan QR: mengembalikan status aset saja (tanpa harga beli/data sensitif). */
  router.get('/assets/scan/:token', requireCapability('asset.read'), async (req, res) => {
    const token = String(req.params.token);
    if (!QR_TOKEN_PATTERN.test(token)) throw new HttpError(404, 'NOT_FOUND', 'QR tidak dikenal');
    const asset = await db.asset.findUnique({ where: { qrToken: token }, include: assetInclude });
    if (!asset) throw new HttpError(404, 'NOT_FOUND', 'QR tidak dikenal');
    const data: AssetScanDto = toScanDto(asset);
    res.json({ data });
  });

  router.get('/assets', requireCapability('asset.read'), async (req, res) => {
    const query = assetListQuerySchema.parse(req.query);
    const and: Prisma.AssetWhereInput[] = [];
    if (query.q) {
      and.push({
        OR: [
          { code: { contains: query.q, mode: 'insensitive' } },
          { serial: { contains: query.q, mode: 'insensitive' } },
          { product: { name: { contains: query.q, mode: 'insensitive' } } },
        ],
      });
    }
    if (query.status) and.push({ status: query.status });
    if (query.condition) and.push({ condition: query.condition });
    if (query.locationId) and.push({ locationId: query.locationId });
    if (query.productId) and.push({ productId: query.productId });
    if (query.attention === 'true') and.push(ATTENTION_WHERE);
    if (query.attention === 'false') and.push({ NOT: ATTENTION_WHERE });
    const where: Prisma.AssetWhereInput = { AND: and };

    const [items, total] = await Promise.all([
      db.asset.findMany({
        where,
        include: assetInclude,
        orderBy: { code: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      db.asset.count({ where }),
    ]);
    const cost = canSeeCost(req);
    const data: Page<AssetDto> = {
      items: items.map((a) => toAssetDto(a, cost)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
    res.json({ data });
  });

  router.post('/assets', requireCapability('asset.write'), async (req, res) => {
    const input = assetCreateSchema.parse(req.body);
    const user = currentUser(req);
    const created = await db.$transaction(async (tx) => {
      const [code] = await nextAssetCodes(tx, 1);
      const status = initialStatus(input.condition);
      const asset = await tx.asset.create({
        data: {
          code: code as string,
          qrToken: newQrToken(),
          productId: input.productId,
          serial: input.serial ?? null,
          condition: input.condition,
          status,
          locationId: input.locationId ?? null,
          supplier: input.supplier ?? null,
          purchaseDate: input.purchaseDate ? dateOnlyToDate(input.purchaseDate) : null,
          purchasePrice: input.purchasePrice ?? null,
          notes: input.notes ?? null,
          createdBy: user.id,
        },
        include: assetInclude,
      });
      await tx.assetStatusEvent.create({
        data: {
          assetId: asset.id,
          type: 'CREATED',
          toStatus: status,
          toCondition: input.condition,
          toLocationId: asset.locationId,
          actorId: user.id,
        },
      });
      await writeAudit(tx, req, {
        action: 'asset.create',
        entity: 'asset',
        entityId: asset.id,
        after: asset,
      });
      return asset;
    });
    res.status(201).json({ data: toAssetDto(created, canSeeCost(req)) });
  });

  router.get('/assets/:id', requireCapability('asset.read'), async (req, res) => {
    const asset = await loadAsset(parseId(req.params.id));
    res.json({ data: toAssetDto(asset, canSeeCost(req)) });
  });

  router.put('/assets/:id', requireCapability('asset.write'), async (req, res) => {
    const id = parseId(req.params.id);
    const input = assetUpdateSchema.parse(req.body);
    const user = currentUser(req);
    const cost = canSeeCost(req);
    const updated = await db.$transaction(async (tx) => {
      const before = await tx.asset.findUnique({ where: { id } });
      if (!before) throw new HttpError(404, 'NOT_FOUND', 'Aset tidak ditemukan');
      if (before.status === 'RETIRED') {
        throw new HttpError(409, 'ASSET_RETIRED', 'Aset yang sudah pensiun tidak dapat diubah');
      }
      const data: Prisma.AssetUncheckedUpdateInput = {
        serial: input.serial ?? null,
        supplier: input.supplier ?? null,
        notes: input.notes ?? null,
      };
      if (input.locationId !== undefined) data.locationId = input.locationId;
      if (input.purchaseDate !== undefined) {
        data.purchaseDate = input.purchaseDate ? dateOnlyToDate(input.purchaseDate) : null;
      }
      if (input.purchasePrice !== undefined && cost) data.purchasePrice = input.purchasePrice;

      const asset = await tx.asset.update({ where: { id }, data, include: assetInclude });

      const locationChanged = asset.locationId !== before.locationId;
      const changed = (
        ['serial', 'supplier', 'notes', 'purchaseDate', 'purchasePrice'] as const
      ).filter((k) => String(before[k] ?? '') !== String(asset[k] ?? ''));
      if (locationChanged) {
        await tx.assetStatusEvent.create({
          data: {
            assetId: id,
            type: 'LOCATION_CHANGED',
            fromLocationId: before.locationId,
            toLocationId: asset.locationId,
            actorId: user.id,
          },
        });
      }
      if (changed.length > 0) {
        // Nilai tidak dicatat di riwayat (harga beli sensitif); hanya nama kolom yang berubah.
        await tx.assetStatusEvent.create({
          data: { assetId: id, type: 'UPDATED', note: changed.join(', '), actorId: user.id },
        });
      }
      await writeAudit(tx, req, {
        action: 'asset.update',
        entity: 'asset',
        entityId: id,
        before,
        after: asset,
      });
      return asset;
    });
    res.json({ data: toAssetDto(updated, cost) });
  });

  router.post('/assets/:id/condition', requireCapability('asset.status'), async (req, res) => {
    const id = parseId(req.params.id);
    const input = assetConditionChangeSchema.parse(req.body);
    const user = currentUser(req);
    const updated = await db.$transaction(async (tx) => {
      const before = await tx.asset.findUnique({ where: { id } });
      if (!before) throw new HttpError(404, 'NOT_FOUND', 'Aset tidak ditemukan');
      if (before.status === 'RETIRED') {
        throw new HttpError(409, 'ASSET_RETIRED', 'Aset yang sudah pensiun tidak dapat diubah');
      }
      if (before.condition === input.condition) {
        throw new HttpError(409, 'NO_CHANGE', 'Kondisi tidak berubah');
      }
      // Aset rusak yang sedang tersedia otomatis masuk karantina agar tidak bisa dialokasikan.
      const toStatus =
        input.condition === 'DAMAGED' && before.status === 'AVAILABLE'
          ? 'QUARANTINED'
          : before.status;
      const claimed = await tx.asset.updateMany({
        where: { id, status: before.status, condition: before.condition },
        data: { condition: input.condition, status: toStatus },
      });
      if (claimed.count === 0) {
        throw new HttpError(409, 'CONFLICT', 'Aset diubah pihak lain, muat ulang data');
      }
      await tx.assetStatusEvent.create({
        data: {
          assetId: id,
          type: 'CONDITION_CHANGED',
          fromCondition: before.condition,
          toCondition: input.condition,
          fromStatus: before.status,
          toStatus,
          note: input.note ?? null,
          actorId: user.id,
        },
      });
      const asset = await tx.asset.findUniqueOrThrow({ where: { id }, include: assetInclude });
      await writeAudit(tx, req, {
        action: 'asset.condition',
        entity: 'asset',
        entityId: id,
        before: { condition: before.condition, status: before.status },
        after: { condition: asset.condition, status: asset.status, note: input.note },
      });
      return asset;
    });
    res.json({ data: toAssetDto(updated, canSeeCost(req)) });
  });

  router.post('/assets/:id/status', requireCapability('asset.status'), async (req, res) => {
    const id = parseId(req.params.id);
    const input = assetStatusChangeSchema.parse(req.body);
    const user = currentUser(req);
    const updated = await db.$transaction(async (tx) => {
      const before = await tx.asset.findUnique({ where: { id } });
      if (!before) throw new HttpError(404, 'NOT_FOUND', 'Aset tidak ditemukan');
      if (!MANUAL_STATUS_TRANSITIONS[before.status].includes(input.status)) {
        throw new HttpError(409, 'INVALID_TRANSITION', 'Perpindahan status tidak diizinkan');
      }
      if (input.status === 'AVAILABLE' && before.condition === 'DAMAGED') {
        throw new HttpError(
          409,
          'CONDITION_BLOCKS_AVAILABLE',
          'Aset rusak harus diperbaiki (ubah kondisi) sebelum tersedia',
        );
      }
      // Insiden belum tuntas / tiket servis terbuka: belum lolos pemeriksaan, tidak boleh tersedia.
      if (input.status === 'AVAILABLE') await assertClearable(tx, id);
      const claimed = await tx.asset.updateMany({
        where: { id, status: before.status },
        data: { status: input.status },
      });
      if (claimed.count === 0) {
        throw new HttpError(409, 'CONFLICT', 'Aset diubah pihak lain, muat ulang data');
      }
      await tx.assetStatusEvent.create({
        data: {
          assetId: id,
          type: 'STATUS_CHANGED',
          fromStatus: before.status,
          toStatus: input.status,
          note: input.note ?? null,
          actorId: user.id,
        },
      });
      const asset = await tx.asset.findUniqueOrThrow({ where: { id }, include: assetInclude });
      await writeAudit(tx, req, {
        action: 'asset.status',
        entity: 'asset',
        entityId: id,
        before: { status: before.status },
        after: { status: input.status, note: input.note },
      });
      return asset;
    });
    res.json({ data: toAssetDto(updated, canSeeCost(req)) });
  });

  router.get('/assets/:id/history', requireCapability('asset.read'), async (req, res) => {
    const id = parseId(req.params.id);
    await loadAsset(id);
    const events = await db.assetStatusEvent.findMany({
      where: { assetId: id },
      include: eventInclude,
      orderBy: { createdAt: 'desc' },
    });
    const receiptIds = [...new Set(events.flatMap((e) => (e.receiptId ? [e.receiptId] : [])))];
    const receipts = await db.stockReceipt.findMany({
      where: { id: { in: receiptIds } },
      select: { id: true, number: true },
    });
    const numbers = new Map(receipts.map((r) => [r.id, r.number]));
    const data: AssetEventDto[] = events.map((e) => toEventDto(e, numbers));
    res.json({ data });
  });

  /** QR lama dicabut dengan mengganti token; kejadian dicatat di riwayat tanpa memuat token. */
  router.post('/assets/:id/qr/regenerate', requireCapability('asset.write'), async (req, res) => {
    const id = parseId(req.params.id);
    const user = currentUser(req);
    await db.$transaction(async (tx) => {
      const before = await tx.asset.findUnique({ where: { id } });
      if (!before) throw new HttpError(404, 'NOT_FOUND', 'Aset tidak ditemukan');
      if (before.status === 'RETIRED') {
        throw new HttpError(409, 'ASSET_RETIRED', 'Aset yang sudah pensiun tidak dapat diubah');
      }
      await tx.asset.update({ where: { id }, data: { qrToken: newQrToken() } });
      await tx.assetStatusEvent.create({
        data: { assetId: id, type: 'QR_REGENERATED', actorId: user.id },
      });
      await writeAudit(tx, req, { action: 'asset.qr.regenerate', entity: 'asset', entityId: id });
    });
    res.json({ data: { ok: true } });
  });

  router.get('/assets/:id/qr.png', requireCapability('asset.read'), async (req, res) => {
    const asset = await loadAsset(parseId(req.params.id));
    const png = await qrPng(asset.qrToken);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(png);
  });

  return router;
}
