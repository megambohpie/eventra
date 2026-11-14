import express, { Router } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  ATTENTION_CONDITIONS,
  MAX_ASSET_PHOTOS,
  MAX_PHOTO_BYTES,
  PHOTO_MIME_TYPES,
  ATTENTION_STATUSES,
  MANUAL_STATUS_TRANSITIONS,
  assetConditionChangeSchema,
  assetCreateSchema,
  assetGroupQuerySchema,
  assetListQuerySchema,
  assetStatusChangeSchema,
  assetUpdateSchema,
  hasCapability,
  labelIdsSchema,
  stockBreakdownQuerySchema,
  unitAreaM2,
  type StockBreakdownDto,
  type StockBreakdownRowDto,
  type AssetBatchDto,
  type AssetPhotoDto,
  type AssetCondition,
  type AssetDto,
  type AssetGroupDto,
  type AssetEventDto,
  type AssetScanDto,
  type AssetStatus,
  type AssetSummaryDto,
  type Page,
} from '@eventra/shared';
import { writeAudit } from '../audit';
import { currentUser, requireCapability } from '../auth/middleware';
import { HttpError } from '../errors';
import { parseId } from '../http';
import { buildLabelsPdf, labelsFilename, qrPng } from '../assets/labels';
import { assertClearable } from '../incidents/service';
import { detectImageMime } from '../warehouse/service';
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

  /** Filter bersama untuk daftar unit, daftar barang, dan rincian per tanggal. */
  const buildWhere = (query: {
    q?: string;
    status?: AssetStatus;
    condition?: AssetCondition;
    locationId?: string;
    productId?: string;
    attention?: 'true' | 'false';
  }): Prisma.AssetWhereInput => {
    const and: Prisma.AssetWhereInput[] = [];
    if (query.q) {
      and.push({
        OR: [
          { code: { contains: query.q, mode: 'insensitive' } },
          { serial: { contains: query.q, mode: 'insensitive' } },
          { brand: { contains: query.q, mode: 'insensitive' } },
          { batchLabel: { contains: query.q, mode: 'insensitive' } },
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
    return { AND: and };
  };

  // ---- Rute statis harus didaftarkan sebelum /assets/:id ----

  /** Satu baris per barang: jumlah unit, sebaran status, dan unit yang perlu perhatian. */
  router.get('/assets/groups', requireCapability('asset.read'), async (req, res) => {
    const query = assetGroupQuerySchema.parse(req.query);
    const where = buildWhere(query);
    const grouped = await db.asset.groupBy({ by: ['productId'], where });
    const products = await db.product.findMany({
      where: { id: { in: grouped.map((g) => g.productId) } },
      include: { category: true },
      orderBy: { name: 'asc' },
    });
    const pageProducts = products.slice(
      (query.page - 1) * query.pageSize,
      query.page * query.pageSize,
    );
    const ids = pageProducts.map((p) => p.id);
    const [byStatus, attention] = await Promise.all([
      db.asset.groupBy({
        by: ['productId', 'status'],
        where: { AND: [where, { productId: { in: ids } }] },
        _count: { _all: true },
      }),
      db.asset.groupBy({
        by: ['productId'],
        where: { AND: [where, { productId: { in: ids } }, ATTENTION_WHERE] },
        _count: { _all: true },
      }),
    ]);
    const items: AssetGroupDto[] = pageProducts.map((p) => {
      const statuses: AssetGroupDto['byStatus'] = {};
      let total = 0;
      for (const row of byStatus) {
        if (row.productId !== p.id) continue;
        statuses[row.status] = row._count._all;
        total += row._count._all;
      }
      return {
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        categoryName: p.category.name,
        total,
        attention: attention.find((a) => a.productId === p.id)?._count._all ?? 0,
        byStatus: statuses,
      };
    });
    const data: Page<AssetGroupDto> = {
      items,
      total: products.length,
      page: query.page,
      pageSize: query.pageSize,
    };
    res.json({ data });
  });

  /** Isi gambar dari body mentah; tipe harus JPEG/PNG dan cocok dengan magic bytes. */
  const imageFrom = (req: express.Request): { mime: string; bytes: Buffer } => {
    const body: unknown = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new HttpError(400, 'INVALID_IMAGE', 'Unggah foto JPEG atau PNG');
    }
    const mime = detectImageMime(body);
    if (!mime || mime !== req.headers['content-type']?.split(';')[0]?.trim()) {
      throw new HttpError(400, 'INVALID_IMAGE', 'Berkas bukan gambar JPEG/PNG yang valid');
    }
    return { mime, bytes: body };
  };
  const sendImage = (res: express.Response, photo: { mimeType: string; data: Uint8Array }) => {
    res.setHeader('Content-Type', photo.mimeType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(Buffer.from(photo.data));
  };
  const batchDate = (req: express.Request): Date => {
    const raw = typeof req.query.date === 'string' ? req.query.date : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Tanggal kelompok tidak valid (YYYY-MM-DD)');
    }
    return dateOnlyToDate(raw);
  };

  /** Foto contoh kelompok pembelian (barang + tanggal perolehan); append-only, maks. 5. */
  router.post(
    '/assets/groups/:productId/photos',
    requireCapability('asset.status'),
    express.raw({ type: [...PHOTO_MIME_TYPES], limit: MAX_PHOTO_BYTES }),
    async (req, res) => {
      const productId = parseId(req.params.productId);
      const date = batchDate(req);
      const { mime, bytes } = imageFrom(req);
      const photo = await db.$transaction(async (tx) => {
        if (!(await tx.product.findUnique({ where: { id: productId }, select: { id: true } }))) {
          throw new HttpError(404, 'NOT_FOUND', 'Barang tidak ditemukan');
        }
        const count = await tx.assetBatchPhoto.count({ where: { productId, batchDate: date } });
        if (count >= MAX_ASSET_PHOTOS) {
          throw new HttpError(409, 'PHOTO_LIMIT', `Maksimal ${MAX_ASSET_PHOTOS} foto per kelompok`);
        }
        const created = await tx.assetBatchPhoto.create({
          data: {
            productId,
            batchDate: date,
            mimeType: mime,
            data: new Uint8Array(bytes),
            createdBy: currentUser(req).id,
          },
          select: { id: true, createdAt: true },
        });
        await writeAudit(tx, req, {
          action: 'asset.batch_photo',
          entity: 'product',
          entityId: productId,
          after: { date: req.query.date, photoId: created.id, bytes: bytes.length },
        });
        return created;
      });
      const data: AssetPhotoDto = { id: photo.id, createdAt: photo.createdAt.toISOString() };
      res.status(201).json({ data });
    },
  );

  router.get(
    '/assets/groups/:productId/photos/:photoId',
    requireCapability('asset.read'),
    async (req, res) => {
      const photo = await db.assetBatchPhoto.findFirst({
        where: { id: parseId(req.params.photoId), productId: parseId(req.params.productId) },
      });
      if (!photo) throw new HttpError(404, 'NOT_FOUND', 'Foto tidak ditemukan');
      sendImage(res, photo);
    },
  );

  /**
   * Rekap stok seperti lembar Excel: barang × label batch × merek, dengan jumlah unit dan total
   * luas (m²). Unit pensiun tidak dihitung. Satu jenis barang boleh memuat banyak merek/pembelian.
   */
  router.get('/assets/breakdown', requireCapability('asset.read'), async (req, res) => {
    const query = stockBreakdownQuerySchema.parse(req.query);
    const where = buildWhere({ ...query });
    const grouped = await db.asset.groupBy({
      by: ['productId', 'batchLabel', 'brand'],
      where: { AND: [where, { status: { not: 'RETIRED' } }] },
      _count: { _all: true },
    });
    const products = await db.product.findMany({
      where: { id: { in: [...new Set(grouped.map((g) => g.productId))] } },
      select: { id: true, name: true, widthCm: true, heightCm: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const rows: StockBreakdownRowDto[] = grouped.flatMap((g) => {
      const product = byId.get(g.productId);
      if (!product) return [];
      const unit = unitAreaM2(product);
      const quantity = g._count._all;
      return [
        {
          productId: product.id,
          productName: product.name,
          batchLabel: g.batchLabel,
          brand: g.brand,
          quantity,
          areaM2: unit === null ? null : Math.round(unit * quantity * 100) / 100,
        },
      ];
    });
    rows.sort(
      (a, b) =>
        a.productName.localeCompare(b.productName) ||
        (a.batchLabel ?? '').localeCompare(b.batchLabel ?? '') ||
        (a.brand ?? '').localeCompare(b.brand ?? ''),
    );
    const data: StockBreakdownDto = {
      rows,
      totalQuantity: rows.reduce((n, r) => n + r.quantity, 0),
    };
    res.json({ data });
  });

  /** Rincian satu barang: unit dikelompokkan per tanggal perolehan (terbaru dulu). */
  router.get('/assets/groups/:productId', requireCapability('asset.read'), async (req, res) => {
    const productId = parseId(req.params.productId);
    const query = assetGroupQuerySchema.parse(req.query);
    const rows = await db.asset.findMany({
      where: buildWhere({ ...query, productId }),
      include: assetInclude,
      orderBy: { code: 'asc' },
      take: 2000,
    });
    const cost = canSeeCost(req);
    const byDate = new Map<string, AssetDto[]>();
    for (const row of rows) {
      const dto = toAssetDto(row, cost);
      byDate.set(dto.acquiredDate, [...(byDate.get(dto.acquiredDate) ?? []), dto]);
    }
    const batchPhotos = await db.assetBatchPhoto.findMany({
      where: { productId },
      select: { id: true, batchDate: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const data: AssetBatchDto[] = [...byDate.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, assets]) => ({
        date,
        quantity: assets.length,
        batchLabels: [...new Set(assets.flatMap((a) => (a.batchLabel ? [a.batchLabel] : [])))],
        brands: [...new Set(assets.map((a) => a.brand))].map((brand) => ({
          brand,
          quantity: assets.filter((a) => a.brand === brand).length,
        })),
        assets,
        photos: batchPhotos
          .filter((p) => p.batchDate.toISOString().slice(0, 10) === date)
          .map((p) => ({ id: p.id, createdAt: p.createdAt.toISOString() })),
      }));
    res.json({ data });
  });

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
    const printedAt = new Date();
    const pdf = await buildLabelsPdf(
      ordered.flatMap((a) =>
        a
          ? [{ code: a.code, qrToken: a.qrToken, productName: a.product.name, serial: a.serial }]
          : [],
      ),
      printedAt,
    );
    await writeAudit(db, req, {
      action: 'asset.labels.print',
      entity: 'asset',
      after: { count: ids.length },
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${labelsFilename(printedAt)}"`);
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
    const where = buildWhere(query);

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
      const codes = await nextAssetCodes(tx, input.quantity);
      const status = initialStatus(input.condition);
      const assets = [];
      for (const code of codes) {
        const asset = await tx.asset.create({
          data: {
            code,
            qrToken: newQrToken(),
            productId: input.productId,
            serial: input.serial ?? null,
            brand: input.brand ?? null,
            batchLabel: input.batchLabel ?? null,
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
        assets.push(asset);
      }
      return assets;
    });
    const [first] = created;
    if (!first) throw new HttpError(500, 'INTERNAL_ERROR', 'Aset tidak terbuat');
    // data = unit pertama (kompatibel dengan pembuatan tunggal); meta memuat jumlah dan seluruh id.
    res.status(201).json({
      data: toAssetDto(first, canSeeCost(req)),
      meta: { count: created.length, ids: created.map((x) => x.id) },
    });
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
        brand: input.brand ?? null,
        batchLabel: input.batchLabel ?? null,
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
        [
          'serial',
          'brand',
          'batchLabel',
          'supplier',
          'notes',
          'purchaseDate',
          'purchasePrice',
        ] as const
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

  // ---- Foto kondisi awal per unit: append-only, maks. 5 ----

  router.get('/assets/:id/photos', requireCapability('asset.read'), async (req, res) => {
    const assetId = parseId(req.params.id);
    await loadAsset(assetId);
    const rows = await db.assetPhoto.findMany({
      where: { assetId },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const data: AssetPhotoDto[] = rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
    }));
    res.json({ data });
  });

  router.post(
    '/assets/:id/photos',
    requireCapability('asset.status'),
    express.raw({ type: [...PHOTO_MIME_TYPES], limit: MAX_PHOTO_BYTES }),
    async (req, res) => {
      const assetId = parseId(req.params.id);
      const { mime, bytes } = imageFrom(req);
      const photo = await db.$transaction(async (tx) => {
        if (!(await tx.asset.findUnique({ where: { id: assetId }, select: { id: true } }))) {
          throw new HttpError(404, 'NOT_FOUND', 'Aset tidak ditemukan');
        }
        const count = await tx.assetPhoto.count({ where: { assetId } });
        if (count >= MAX_ASSET_PHOTOS) {
          throw new HttpError(409, 'PHOTO_LIMIT', `Maksimal ${MAX_ASSET_PHOTOS} foto per aset`);
        }
        const created = await tx.assetPhoto.create({
          data: {
            assetId,
            mimeType: mime,
            data: new Uint8Array(bytes),
            createdBy: currentUser(req).id,
          },
          select: { id: true, createdAt: true },
        });
        await writeAudit(tx, req, {
          action: 'asset.photo',
          entity: 'asset',
          entityId: assetId,
          after: { photoId: created.id, bytes: bytes.length },
        });
        return created;
      });
      const data: AssetPhotoDto = { id: photo.id, createdAt: photo.createdAt.toISOString() };
      res.status(201).json({ data });
    },
  );

  router.get('/assets/:id/photos/:photoId', requireCapability('asset.read'), async (req, res) => {
    const photo = await db.assetPhoto.findFirst({
      where: { id: parseId(req.params.photoId), assetId: parseId(req.params.id) },
    });
    if (!photo) throw new HttpError(404, 'NOT_FOUND', 'Foto tidak ditemukan');
    sendImage(res, photo);
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
