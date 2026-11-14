import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  hasCapability,
  receiptInputSchema,
  receiptListQuerySchema,
  type Page,
  type ReceiptDto,
} from '@eventra/shared';
import { writeAudit } from '../audit';
import { currentUser, requireCapability } from '../auth/middleware';
import { HttpError } from '../errors';
import { parseId } from '../http';
import {
  dateOnlyToDate,
  initialStatus,
  newQrToken,
  nextAssetCodes,
  nextReceiptNumber,
  assertTrackedProducts,
} from '../assets/service';

const receiptInclude = {
  location: { select: { name: true } },
  receiver: { select: { name: true } },
  items: { include: { product: { select: { name: true } } }, orderBy: { id: 'asc' } },
} satisfies Prisma.StockReceiptInclude;

type ReceiptRow = Prisma.StockReceiptGetPayload<{ include: typeof receiptInclude }>;

function toReceiptDto(r: ReceiptRow, canSeeCost: boolean, assetIds?: string[]): ReceiptDto {
  return {
    id: r.id,
    number: r.number,
    source: r.source,
    status: r.status,
    sourceRef: r.sourceRef,
    supplier: r.supplier,
    batchLabel: r.batchLabel,
    locationId: r.locationId,
    locationName: r.location.name,
    receivedDate: r.receivedDate.toISOString().slice(0, 10),
    receivedBy: r.receiver?.name ?? null,
    receivedAt: r.receivedAt?.toISOString() ?? null,
    note: r.note,
    totalUnits: r.items.reduce((n, i) => n + i.quantity, 0),
    items: r.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.product.name,
      quantity: i.quantity,
      ...(canSeeCost ? { unitCost: i.unitCost === null ? null : Number(i.unitCost) } : {}),
      brand: i.brand,
      condition: i.condition,
      serials: i.serials,
    })),
    ...(assetIds ? { assetIds } : {}),
    createdAt: r.createdAt.toISOString(),
  };
}

type ReceiptInputParsed = ReturnType<typeof receiptInputSchema.parse>;

const itemData = (items: ReceiptInputParsed['items'], canSeeCost: boolean) =>
  items.map((i) => ({
    productId: i.productId,
    quantity: i.quantity,
    unitCost: canSeeCost ? (i.unitCost ?? null) : null,
    brand: i.brand ?? null,
    condition: i.condition,
    serials: i.serials,
  }));

export function receiptsRouter(db: PrismaClient): Router {
  const router = Router();
  const canSeeCost = (req: Parameters<typeof currentUser>[0]) =>
    hasCapability(currentUser(req).role, 'asset.cost.read');

  const loadReceipt = async (id: string, tx: Prisma.TransactionClient | PrismaClient = db) => {
    const receipt = await tx.stockReceipt.findUnique({ where: { id }, include: receiptInclude });
    if (!receipt) throw new HttpError(404, 'NOT_FOUND', 'Penerimaan tidak ditemukan');
    return receipt;
  };

  router.get('/stock-receipts', requireCapability('receipt.read'), async (req, res) => {
    const query = receiptListQuerySchema.parse(req.query);
    const and: Prisma.StockReceiptWhereInput[] = [];
    if (query.status) and.push({ status: query.status });
    if (query.q) {
      and.push({
        OR: [
          { number: { contains: query.q, mode: 'insensitive' } },
          { sourceRef: { contains: query.q, mode: 'insensitive' } },
          { supplier: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.StockReceiptWhereInput = { AND: and };
    const [items, total] = await Promise.all([
      db.stockReceipt.findMany({
        where,
        include: receiptInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      db.stockReceipt.count({ where }),
    ]);
    const cost = canSeeCost(req);
    const data: Page<ReceiptDto> = {
      items: items.map((r) => toReceiptDto(r, cost)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
    res.json({ data });
  });

  router.get('/stock-receipts/:id', requireCapability('receipt.read'), async (req, res) => {
    const id = parseId(req.params.id);
    const receipt = await loadReceipt(id);
    const assets = await db.asset.findMany({
      where: { receiptId: id },
      select: { id: true },
      orderBy: { code: 'asc' },
    });
    res.json({
      data: toReceiptDto(
        receipt,
        canSeeCost(req),
        assets.map((a) => a.id),
      ),
    });
  });

  router.post('/stock-receipts', requireCapability('receipt.write'), async (req, res) => {
    const input = receiptInputSchema.parse(req.body);
    const user = currentUser(req);
    const cost = canSeeCost(req);
    const receipt = await db.$transaction(async (tx) => {
      await assertTrackedProducts(
        tx,
        input.items.map((i) => i.productId),
      );
      const date = dateOnlyToDate(input.receivedDate);
      const created = await tx.stockReceipt.create({
        data: {
          number: await nextReceiptNumber(tx, date),
          source: input.source,
          sourceRef: input.sourceRef ?? null,
          supplier: input.supplier ?? null,
          batchLabel: input.batchLabel ?? null,
          locationId: input.locationId,
          receivedDate: date,
          note: input.note ?? null,
          createdBy: user.id,
          items: { create: itemData(input.items, cost) },
        },
        include: receiptInclude,
      });
      await writeAudit(tx, req, {
        action: 'stock_receipt.create',
        entity: 'stock_receipt',
        entityId: created.id,
        after: created,
      });
      return created;
    });
    res.status(201).json({ data: toReceiptDto(receipt, cost) });
  });

  /** Ubah draft: hanya saat DRAFT; item diganti utuh. */
  router.put('/stock-receipts/:id', requireCapability('receipt.write'), async (req, res) => {
    const id = parseId(req.params.id);
    const input = receiptInputSchema.parse(req.body);
    const cost = canSeeCost(req);
    const receipt = await db.$transaction(async (tx) => {
      const before = await loadReceipt(id, tx);
      if (before.status !== 'DRAFT') {
        throw new HttpError(409, 'RECEIPT_NOT_DRAFT', 'Hanya penerimaan draft yang dapat diubah');
      }
      await assertTrackedProducts(
        tx,
        input.items.map((i) => i.productId),
      );
      const date = dateOnlyToDate(input.receivedDate);
      // Biaya lama dipertahankan bila pengubah tidak berhak melihat biaya.
      const keepCosts = new Map(before.items.map((i) => [i.productId, i.unitCost]));
      const items = itemData(input.items, cost).map((i) =>
        cost ? i : { ...i, unitCost: keepCosts.get(i.productId) ?? null },
      );
      await tx.stockReceiptItem.deleteMany({ where: { receiptId: id } });
      const updated = await tx.stockReceipt.update({
        where: { id },
        data: {
          source: input.source,
          sourceRef: input.sourceRef ?? null,
          supplier: input.supplier ?? null,
          batchLabel: input.batchLabel ?? null,
          locationId: input.locationId,
          receivedDate: date,
          note: input.note ?? null,
          items: { create: items },
        },
        include: receiptInclude,
      });
      await writeAudit(tx, req, {
        action: 'stock_receipt.update',
        entity: 'stock_receipt',
        entityId: id,
        before,
        after: updated,
      });
      return updated;
    });
    res.json({ data: toReceiptDto(receipt, cost) });
  });

  router.post(
    '/stock-receipts/:id/cancel',
    requireCapability('receipt.write'),
    async (req, res) => {
      const id = parseId(req.params.id);
      const cost = canSeeCost(req);
      const receipt = await db.$transaction(async (tx) => {
        await loadReceipt(id, tx);
        const claimed = await tx.stockReceipt.updateMany({
          where: { id, status: 'DRAFT' },
          data: { status: 'CANCELLED' },
        });
        if (claimed.count === 0) {
          throw new HttpError(
            409,
            'RECEIPT_NOT_DRAFT',
            'Hanya penerimaan draft yang dapat dibatalkan',
          );
        }
        await writeAudit(tx, req, {
          action: 'stock_receipt.cancel',
          entity: 'stock_receipt',
          entityId: id,
          before: { status: 'DRAFT' },
          after: { status: 'CANCELLED' },
        });
        return loadReceipt(id, tx);
      });
      res.json({ data: toReceiptDto(receipt, cost) });
    },
  );

  /**
   * Menyelesaikan penerimaan: dalam satu transaksi, status DRAFT→RECEIVED diklaim atomik
   * (dua permintaan bersamaan tidak dapat menggandakan aset), lalu setiap unit memperoleh
   * kode aset dan token QR unik beserta event riwayat asal.
   */
  router.post(
    '/stock-receipts/:id/receive',
    requireCapability('receipt.write'),
    async (req, res) => {
      const id = parseId(req.params.id);
      const user = currentUser(req);
      const cost = canSeeCost(req);
      const { receipt, assetIds } = await db.$transaction(async (tx) => {
        const draft = await loadReceipt(id, tx);
        const claimed = await tx.stockReceipt.updateMany({
          where: { id, status: 'DRAFT' },
          data: { status: 'RECEIVED', receivedById: user.id, receivedAt: new Date() },
        });
        if (claimed.count === 0) {
          throw new HttpError(
            409,
            'RECEIPT_NOT_DRAFT',
            'Penerimaan ini sudah diselesaikan/dibatalkan',
          );
        }

        const productIds = [...new Set(draft.items.map((i) => i.productId))];
        const products = await tx.product.findMany({ where: { id: { in: productIds } } });
        if (products.some((p) => !p.active)) {
          throw new HttpError(409, 'PRODUCT_INACTIVE', 'Penerimaan memuat produk nonaktif');
        }
        await assertTrackedProducts(tx, productIds);
        const location = await tx.location.findUniqueOrThrow({ where: { id: draft.locationId } });
        if (!location.active) {
          throw new HttpError(409, 'LOCATION_INACTIVE', 'Lokasi penerimaan nonaktif');
        }

        const total = draft.items.reduce((n, i) => n + i.quantity, 0);
        const codes = await nextAssetCodes(tx, total);
        const assets: Prisma.AssetCreateManyInput[] = [];
        const events: Prisma.AssetStatusEventCreateManyInput[] = [];
        let cursor = 0;
        for (const item of draft.items) {
          for (let n = 0; n < item.quantity; n += 1) {
            const assetId = randomUUID();
            const status = initialStatus(item.condition);
            assets.push({
              id: assetId,
              code: codes[cursor] as string,
              qrToken: newQrToken(),
              productId: item.productId,
              serial: item.serials[n] ?? null,
              brand: item.brand,
              batchLabel: draft.batchLabel,
              condition: item.condition,
              status,
              locationId: draft.locationId,
              supplier: draft.supplier,
              purchaseDate: draft.receivedDate,
              purchasePrice: item.unitCost,
              receiptId: id,
              createdBy: user.id,
            });
            events.push({
              assetId,
              type: 'RECEIVED',
              toStatus: status,
              toCondition: item.condition,
              toLocationId: draft.locationId,
              receiptId: id,
              note: draft.source,
              actorId: user.id,
            });
            cursor += 1;
          }
        }
        await tx.asset.createMany({ data: assets });
        await tx.assetStatusEvent.createMany({ data: events });
        await writeAudit(tx, req, {
          action: 'stock_receipt.receive',
          entity: 'stock_receipt',
          entityId: id,
          before: { status: 'DRAFT' },
          after: { status: 'RECEIVED', units: total },
        });
        return { receipt: await loadReceipt(id, tx), assetIds: assets.map((a) => a.id as string) };
      });
      res.json({ data: toReceiptDto(receipt, cost, assetIds) });
    },
  );

  return router;
}
