import express, { Router, type Request } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  ACTIVE_PICK_ITEM_STATUSES,
  MAX_RETURN_PHOTOS,
  MAX_PHOTO_BYTES,
  MAX_SIGNATURE_BYTES,
  PHOTO_MIME_TYPES,
  PICKABLE_ORDER_STATUSES,
  RETURNABLE_ASSET_STATUSES,
  checkoutSchema,
  documentReviseSchema,
  documentSignSchema,
  pickListCreateSchema,
  pickListListQuerySchema,
  pickScanSchema,
  returnCompleteSchema,
  returnScanSchema,
  type HandoverDocumentDto,
  type OrderSummaryDto,
  type Page,
  type PickListDto,
  type PickListSummaryDto,
  type ScanAction,
  type ScanMethod,
  type ScanOutcomeDto,
} from '@eventra/shared';
import { writeAudit } from '../audit';
import { currentUser, requireCapability } from '../auth/middleware';
import { HttpError } from '../errors';
import { parseId } from '../http';
import { QR_TOKEN_PATTERN } from '../assets/service';
import { planItems, requirements } from '../orders/availability';
import { claimTransition, recordStatus, toSummaryDto as toOrderSummary } from '../orders/service';
import { assetBlockers } from '../incidents/service';
import { buildHandoverPdf, type PdfSignature } from '../warehouse/pdf';
import {
  ScanRejected,
  cancelPickList,
  createHandoverDocument,
  detectImageMime,
  loadPickList,
  lockPickList,
  moveAsset,
  nextPickListNumber,
  pickListInclude,
  recordAssetEvent,
  releaseItem,
  summaryInclude,
  toDocumentDtos,
  toPickListDto,
  toSummaryDto,
  type Tx,
} from '../warehouse/service';

const ACTIVE = [...ACTIVE_PICK_ITEM_STATUSES];
const PIC_ROLE_LABEL: Record<string, string> = {
  CUSTOMER_PIC: 'PIC Penyewa',
  WAREHOUSE_OUT: 'PIC Gudang Keluar',
  WAREHOUSE_IN: 'PIC Gudang Kembali',
  FIELD: 'PIC Lapangan',
};

export function warehouseRouter(db: PrismaClient): Router {
  const router = Router();

  const respond = async (id: string): Promise<PickListDto> =>
    toPickListDto(db, await loadPickList(db, id));

  const outcome = async (pickListId: string, itemId: string): Promise<ScanOutcomeDto> => {
    const pickList = await respond(pickListId);
    const item = pickList.items.find((i) => i.id === itemId);
    if (!item) throw new HttpError(404, 'NOT_FOUND', 'Item tidak ditemukan');
    return { item, pickList };
  };

  /**
   * Jalankan scan dalam transaksi. Penolakan bisnis (ScanRejected) membatalkan transaksi lalu dicatat
   * sebagai scan event REJECTED + audit, sehingga percobaan scan salah tetap berjejak.
   */
  async function guarded(
    req: Request,
    ctx: { action: ScanAction; method: ScanMethod; pickListId: string },
    fn: (tx: Tx) => Promise<string>,
  ): Promise<string> {
    try {
      return await db.$transaction(fn);
    } catch (error) {
      if (error instanceof ScanRejected) {
        const pick = await db.pickList.findUnique({
          where: { id: ctx.pickListId },
          select: { orderId: true },
        });
        await db.scanEvent.create({
          data: {
            action: ctx.action,
            result: 'REJECTED',
            method: ctx.method,
            reason: error.code,
            pickListId: pick ? ctx.pickListId : null,
            orderId: pick?.orderId ?? null,
            assetId: error.assetId,
            actorId: currentUser(req).id,
          },
        });
        await writeAudit(db, req, {
          action: 'scan.rejected',
          entity: 'pick_list',
          entityId: ctx.pickListId,
          after: { scanAction: ctx.action, reason: error.code, assetId: error.assetId },
        });
      }
      throw error;
    }
  }

  async function resolveAsset(tx: Tx, input: { qrToken?: string; assetCode?: string }) {
    const asset = input.qrToken
      ? QR_TOKEN_PATTERN.test(input.qrToken)
        ? await tx.asset.findUnique({ where: { qrToken: input.qrToken } })
        : null
      : await tx.asset.findUnique({ where: { code: input.assetCode ?? '' } });
    if (!asset) throw new ScanRejected('SCAN_UNKNOWN_QR', 'QR/kode aset tidak dikenal', null, 404);
    return asset;
  }

  // ---------- Daftar & pembuatan ----------

  router.get('/pick-lists', requireCapability('warehouse.read'), async (req, res) => {
    const q = pickListListQuerySchema.parse(req.query);
    const and: Prisma.PickListWhereInput[] = [];
    if (q.status) and.push({ status: q.status });
    if (q.q) {
      and.push({
        OR: [
          { number: { contains: q.q, mode: 'insensitive' } },
          { order: { number: { contains: q.q, mode: 'insensitive' } } },
          { order: { customer: { name: { contains: q.q, mode: 'insensitive' } } } },
        ],
      });
    }
    const where: Prisma.PickListWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      db.pickList.findMany({
        where,
        include: summaryInclude,
        orderBy: [{ createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.pickList.count({ where }),
    ]);
    const data: Page<PickListSummaryDto> = {
      items: rows.map(toSummaryDto),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
    res.json({ data });
  });

  /** Pesanan yang siap dibuatkan pick list (terkonfirmasi/terjadwal dan belum punya pick list aktif). */
  router.get(
    '/pick-lists/eligible-orders',
    requireCapability('warehouse.read'),
    async (_req, res) => {
      const rows = await db.order.findMany({
        where: {
          status: { in: [...PICKABLE_ORDER_STATUSES] },
          pickLists: { none: { status: { not: 'CANCELLED' } } },
        },
        include: { customer: { select: { name: true } } },
        orderBy: [{ startDate: 'asc' }, { number: 'asc' }],
        take: 100,
      });
      const data: OrderSummaryDto[] = rows.map(toOrderSummary);
      res.json({ data });
    },
  );

  router.post('/pick-lists', requireCapability('warehouse.write'), async (req, res) => {
    const { orderId } = pickListCreateSchema.parse(req.body);
    const user = currentUser(req);
    const id = await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
      if (!order) throw new HttpError(400, 'INVALID_REFERENCE', 'Pesanan tidak ditemukan');
      if (!PICKABLE_ORDER_STATUSES.includes(order.status)) {
        throw new HttpError(
          409,
          'INVALID_ORDER_STATE',
          'Pick list hanya untuk pesanan yang sudah dikonfirmasi',
        );
      }
      const existing = await tx.pickList.findFirst({
        where: { orderId, status: { not: 'CANCELLED' } },
      });
      if (existing)
        throw new HttpError(409, 'PICK_LIST_EXISTS', 'Pesanan ini sudah punya pick list');

      const plans = await planItems(
        tx,
        order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      );
      const pick = await tx.pickList.create({
        data: {
          number: await nextPickListNumber(tx),
          orderId,
          createdBy: user.id,
          lines: {
            create: [...requirements(plans).entries()].map(([productId, quantity]) => ({
              productId,
              quantity,
            })),
          },
        },
        include: { lines: true },
      });
      await writeAudit(tx, req, {
        action: 'pick_list.create',
        entity: 'pick_list',
        entityId: pick.id,
        after: pick,
      });
      return pick.id;
    });
    res.status(201).json({ data: await respond(id) });
  });

  router.get('/pick-lists/:id', requireCapability('warehouse.read'), async (req, res) => {
    res.json({ data: await respond(parseId(req.params.id)) });
  });

  router.post('/pick-lists/:id/cancel', requireCapability('warehouse.write'), async (req, res) => {
    const id = parseId(req.params.id);
    const user = currentUser(req);
    await db.$transaction(async (tx) => {
      await lockPickList(tx, id);
      const pick = await tx.pickList.findUniqueOrThrow({ where: { id } });
      if (pick.status !== 'OPEN' && pick.status !== 'VERIFIED') {
        throw new HttpError(409, 'PICK_LIST_CLOSED', 'Pick list sudah tidak dapat dibatalkan');
      }
      const released = await cancelPickList(tx, id, user.id, 'Pick list dibatalkan');
      await writeAudit(tx, req, {
        action: 'pick_list.cancel',
        entity: 'pick_list',
        entityId: id,
        before: { status: pick.status },
        after: { status: 'CANCELLED', releasedAssets: released },
      });
    });
    res.json({ data: await respond(id) });
  });

  // ---------- Scan persiapan: pilih & verifikasi akhir ----------

  router.post('/pick-lists/:id/scan', requireCapability('warehouse.write'), async (req, res) => {
    const id = parseId(req.params.id);
    const input = pickScanSchema.parse(req.body);
    const user = currentUser(req);
    const method: ScanMethod = input.qrToken ? 'QR' : 'MANUAL';

    const itemId = await guarded(
      req,
      { action: input.action, method, pickListId: id },
      async (tx) => {
        const orderStatus = await lockPickList(tx, id);
        const pick = await tx.pickList.findUniqueOrThrow({
          where: { id },
          include: { lines: true, items: { where: { status: { in: ACTIVE } } } },
        });
        if (pick.status !== 'OPEN' && pick.status !== 'VERIFIED') {
          throw new HttpError(
            409,
            'PICK_LIST_CLOSED',
            'Pick list sudah tidak menerima scan persiapan',
          );
        }
        if (!PICKABLE_ORDER_STATUSES.includes(orderStatus)) {
          throw new HttpError(409, 'INVALID_ORDER_STATE', 'Status pesanan tidak mengizinkan scan');
        }
        const asset = await resolveAsset(tx, input);
        const existing = pick.items.find((i) => i.assetId === asset.id);

        if (input.action === 'PICK') {
          if (existing) {
            throw new ScanRejected(
              'SCAN_ALREADY_PICKED',
              'Aset sudah ada di pick list ini',
              asset.id,
            );
          }
          const line = pick.lines.find((l) => l.productId === asset.productId);
          if (!line) {
            throw new ScanRejected(
              'SCAN_PRODUCT_NOT_REQUIRED',
              'Produk aset ini tidak dibutuhkan pesanan',
              asset.id,
            );
          }
          if (pick.items.filter((i) => i.productId === asset.productId).length >= line.quantity) {
            throw new ScanRejected(
              'SCAN_QUANTITY_FULL',
              'Jumlah produk ini sudah terpenuhi',
              asset.id,
            );
          }
          if (asset.condition === 'DAMAGED') {
            throw new ScanRejected(
              'SCAN_ASSET_DAMAGED',
              'Aset rusak tidak dapat dipilih',
              asset.id,
            );
          }
          if (asset.status !== 'AVAILABLE') {
            throw new ScanRejected(
              'SCAN_ASSET_UNAVAILABLE',
              `Aset berstatus ${asset.status}, bukan AVAILABLE`,
              asset.id,
            );
          }
          await moveAsset(tx, asset, 'RESERVED', user.id, `Dipilih untuk ${pick.number}`);
          const item = await tx.pickListItem.create({
            data: { pickListId: id, assetId: asset.id, productId: asset.productId },
          });
          await tx.scanEvent.create({
            data: {
              action: 'PICK',
              result: 'OK',
              method,
              pickListId: id,
              orderId: pick.orderId,
              assetId: asset.id,
              condition: asset.condition,
              actorId: user.id,
            },
          });
          await writeAudit(tx, req, {
            action: 'pick_list.pick',
            entity: 'pick_list',
            entityId: id,
            after: { assetId: asset.id, assetCode: asset.code, method },
          });
          return item.id;
        }

        // VERIFY: wajib QR; aset harus sudah dipilih pada pick list ini.
        if (!existing) {
          throw new ScanRejected(
            'SCAN_NOT_IN_PICK_LIST',
            'Aset tidak ada di pick list (tidak sesuai)',
            asset.id,
          );
        }
        if (existing.status !== 'PICKED') {
          throw new ScanRejected('SCAN_ALREADY_VERIFIED', 'Aset sudah diverifikasi', asset.id);
        }
        if (asset.condition === 'DAMAGED') {
          throw new ScanRejected('SCAN_ASSET_DAMAGED', 'Aset rusak tidak dapat keluar', asset.id);
        }
        if (asset.status !== 'RESERVED') {
          throw new ScanRejected(
            'SCAN_ASSET_UNAVAILABLE',
            `Aset berstatus ${asset.status}, bukan RESERVED`,
            asset.id,
          );
        }
        await moveAsset(tx, asset, 'PREPARED', user.id, `Terverifikasi untuk ${pick.number}`);
        await tx.pickListItem.update({
          where: { id: existing.id },
          data: { status: 'VERIFIED', verifiedAt: new Date() },
        });
        await tx.scanEvent.create({
          data: {
            action: 'VERIFY',
            result: 'OK',
            method: 'QR',
            pickListId: id,
            orderId: pick.orderId,
            assetId: asset.id,
            condition: asset.condition,
            actorId: user.id,
          },
        });
        const items = await tx.pickListItem.findMany({
          where: { pickListId: id, status: { in: ACTIVE } },
        });
        const complete =
          items.every((i) => i.status === 'VERIFIED') &&
          pick.lines.every(
            (l) => items.filter((i) => i.productId === l.productId).length === l.quantity,
          );
        if (complete && pick.status === 'OPEN') {
          await tx.pickList.update({ where: { id }, data: { status: 'VERIFIED' } });
        }
        await writeAudit(tx, req, {
          action: 'pick_list.verify',
          entity: 'pick_list',
          entityId: id,
          after: { assetId: asset.id, assetCode: asset.code, listVerified: complete },
        });
        return existing.id;
      },
    );
    res.json({ data: await outcome(id, itemId) });
  });

  /** Lepas aset yang salah dipilih (sebelum keluar gudang); riwayat tetap tersimpan. */
  router.delete(
    '/pick-lists/:id/items/:itemId',
    requireCapability('warehouse.write'),
    async (req, res) => {
      const id = parseId(req.params.id);
      const itemId = parseId(req.params.itemId);
      const user = currentUser(req);
      await db.$transaction(async (tx) => {
        await lockPickList(tx, id);
        const pick = await tx.pickList.findUniqueOrThrow({ where: { id } });
        if (pick.status !== 'OPEN' && pick.status !== 'VERIFIED') {
          throw new HttpError(409, 'PICK_LIST_CLOSED', 'Item tidak dapat dilepas lagi');
        }
        const item = await tx.pickListItem.findFirst({
          where: { id: itemId, pickListId: id, status: { in: ['PICKED', 'VERIFIED'] } },
        });
        if (!item) throw new HttpError(404, 'NOT_FOUND', 'Item tidak ditemukan');
        await releaseItem(tx, item, pick, user.id, 'Dilepas dari pick list');
        if (pick.status === 'VERIFIED') {
          await tx.pickList.update({ where: { id }, data: { status: 'OPEN' } });
        }
        await writeAudit(tx, req, {
          action: 'pick_list.unpick',
          entity: 'pick_list',
          entityId: id,
          after: { assetId: item.assetId },
        });
      });
      res.json({ data: await respond(id) });
    },
  );

  // ---------- Barang keluar ----------

  router.post(
    '/pick-lists/:id/checkout',
    requireCapability('warehouse.write'),
    async (req, res) => {
      const id = parseId(req.params.id);
      const { note } = checkoutSchema.parse(req.body ?? {});
      const user = currentUser(req);
      await db.$transaction(async (tx) => {
        const orderStatus = await lockPickList(tx, id);
        const pick = await tx.pickList.findUniqueOrThrow({
          where: { id },
          include: {
            lines: { include: { product: { select: { name: true } } } },
            items: { where: { status: { in: ACTIVE } }, include: { asset: true } },
          },
        });
        if (pick.status !== 'VERIFIED') {
          throw new HttpError(
            409,
            'PICK_LIST_NOT_VERIFIED',
            'Semua aset harus dipilih dan diverifikasi sebelum barang keluar',
          );
        }
        if (orderStatus !== 'SCHEDULED') {
          throw new HttpError(
            409,
            'ORDER_NOT_SCHEDULED',
            'Pesanan harus dijadwalkan (PIC lengkap) sebelum barang keluar',
          );
        }
        // Verifikasi ulang terhadap pick list: jumlah per produk dan kondisi aset saat ini.
        const problems: string[] = [];
        for (const l of pick.lines) {
          const verified = pick.items.filter(
            (i) => i.productId === l.productId && i.status === 'VERIFIED',
          ).length;
          if (verified !== l.quantity) {
            problems.push(`${l.product.name}: ${verified}/${l.quantity}`);
          }
        }
        for (const i of pick.items) {
          if (i.asset.status !== 'PREPARED' || i.asset.condition === 'DAMAGED') {
            problems.push(`${i.asset.code}: ${i.asset.status}/${i.asset.condition}`);
          }
        }
        if (problems.length > 0) {
          throw new HttpError(
            409,
            'CHECKOUT_BLOCKED',
            `Pick list belum sesuai: ${problems.join('; ')}`,
            {
              items: problems,
            },
          );
        }

        const now = new Date();
        for (const item of pick.items) {
          await moveAsset(tx, item.asset, 'CHECKED_OUT', user.id, `Keluar gudang (${pick.number})`);
          await tx.pickListItem.update({
            where: { id: item.id },
            data: {
              status: 'DISPATCHED',
              dispatchedAt: now,
              dispatchCondition: item.asset.condition,
            },
          });
          await tx.scanEvent.create({
            data: {
              action: 'CHECKOUT',
              result: 'OK',
              method: 'QR',
              pickListId: id,
              orderId: pick.orderId,
              assetId: item.assetId,
              condition: item.asset.condition,
              note: note ?? null,
              actorId: user.id,
            },
          });
        }
        await tx.pickList.update({
          where: { id },
          data: { status: 'DISPATCHED', dispatchedAt: now },
        });
        const from = await claimTransition(tx, pick.orderId, ['SCHEDULED'], 'IN_PROGRESS');
        await recordStatus(
          tx,
          pick.orderId,
          from,
          'IN_PROGRESS',
          user.id,
          `Barang keluar (${pick.number})`,
        );
        const doc = await createHandoverDocument(tx, {
          pickListId: id,
          orderId: pick.orderId,
          type: 'OUT',
          actor: user,
          note: note ?? null,
        });
        await writeAudit(tx, req, {
          action: 'pick_list.checkout',
          entity: 'pick_list',
          entityId: id,
          before: { status: 'VERIFIED' },
          after: {
            status: 'DISPATCHED',
            assets: pick.items.length,
            document: `${doc.number} v${doc.version}`,
          },
        });
      });
      res.json({ data: await respond(id) });
    },
  );

  // ---------- Barang kembali ----------

  router.post(
    '/pick-lists/:id/return/scan',
    requireCapability('warehouse.write'),
    async (req, res) => {
      const id = parseId(req.params.id);
      const input = returnScanSchema.parse(req.body);
      const user = currentUser(req);
      const itemId = await guarded(
        req,
        { action: 'RETURN', method: 'QR', pickListId: id },
        async (tx) => {
          await lockPickList(tx, id);
          const pick = await tx.pickList.findUniqueOrThrow({
            where: { id },
            include: { items: { where: { status: { in: [...ACTIVE, 'RETURNED'] } } } },
          });
          if (pick.status !== 'DISPATCHED' && pick.status !== 'RETURN_ISSUE') {
            throw new HttpError(
              409,
              'PICK_LIST_CLOSED',
              'Pick list tidak sedang menunggu pengembalian',
            );
          }
          const asset = await resolveAsset(tx, { qrToken: input.qrToken });
          const item = pick.items.find((i) => i.assetId === asset.id);
          if (!item) {
            throw new ScanRejected(
              'SCAN_NOT_IN_PICK_LIST',
              'Aset ini tidak termasuk dalam pengeluaran pesanan ini',
              asset.id,
            );
          }
          if (item.status === 'RETURNED') {
            throw new ScanRejected(
              'SCAN_ALREADY_RETURNED',
              'Aset ini sudah discan kembali',
              asset.id,
            );
          }
          if (!RETURNABLE_ASSET_STATUSES.includes(asset.status)) {
            throw new ScanRejected(
              'SCAN_WRONG_STATE',
              `Aset berstatus ${asset.status}, tidak sedang di luar gudang`,
              asset.id,
            );
          }
          let locationId: string | null | undefined;
          if (input.locationId) {
            const location = await tx.location.findUnique({ where: { id: input.locationId } });
            if (!location) throw new HttpError(400, 'INVALID_REFERENCE', 'Lokasi tidak ditemukan');
            if (!location.active) throw new HttpError(409, 'LOCATION_INACTIVE', 'Lokasi nonaktif');
            locationId = location.id;
          }

          // Aset rusak, atau yang masih punya insiden/tiket servis terbuka, masuk karantina sampai lolos
          // pemeriksaan (tidak bisa dialokasikan); selain itu kembali tersedia.
          const blockers = await assetBlockers(tx, asset.id);
          const toStatus =
            input.condition === 'DAMAGED' || blockers.incident || blockers.ticket
              ? 'QUARANTINED'
              : 'AVAILABLE';
          const data: Prisma.AssetUncheckedUpdateManyInput = { condition: input.condition };
          if (locationId && locationId !== asset.locationId) data.locationId = locationId;
          await moveAsset(tx, asset, toStatus, user.id, `Kembali (${pick.number})`, data);
          if (input.condition !== asset.condition) {
            await recordAssetEvent(tx, {
              assetId: asset.id,
              type: 'CONDITION_CHANGED',
              fromCondition: asset.condition,
              toCondition: input.condition,
              note: input.note ?? `Kondisi saat kembali (${pick.number})`,
              actorId: user.id,
            });
          }
          if (locationId && locationId !== asset.locationId) {
            await recordAssetEvent(tx, {
              assetId: asset.id,
              type: 'LOCATION_CHANGED',
              fromLocationId: asset.locationId,
              toLocationId: locationId,
              actorId: user.id,
            });
          }
          await tx.pickListItem.update({
            where: { id: item.id },
            data: {
              status: 'RETURNED',
              returnedAt: new Date(),
              returnCondition: input.condition,
              returnNote: input.note ?? null,
            },
          });
          await tx.scanEvent.create({
            data: {
              action: 'RETURN',
              result: 'OK',
              method: 'QR',
              pickListId: id,
              orderId: pick.orderId,
              assetId: asset.id,
              condition: input.condition,
              note: input.note ?? null,
              actorId: user.id,
            },
          });
          await writeAudit(tx, req, {
            action: 'pick_list.return_scan',
            entity: 'pick_list',
            entityId: id,
            after: {
              assetId: asset.id,
              assetCode: asset.code,
              condition: input.condition,
              assetStatus: toStatus,
            },
          });
          return item.id;
        },
      );
      res.json({ data: await outcome(id, itemId) });
    },
  );

  router.post(
    '/pick-lists/:id/return/complete',
    requireCapability('warehouse.write'),
    async (req, res) => {
      const id = parseId(req.params.id);
      const input = returnCompleteSchema.parse(req.body ?? {});
      const user = currentUser(req);
      await db.$transaction(async (tx) => {
        const orderStatus = await lockPickList(tx, id);
        const pick = await tx.pickList.findUniqueOrThrow({
          where: { id },
          include: {
            items: { where: { status: { in: [...ACTIVE, 'RETURNED'] } }, include: { asset: true } },
          },
        });
        if (pick.status !== 'DISPATCHED' && pick.status !== 'RETURN_ISSUE') {
          throw new HttpError(
            409,
            'PICK_LIST_CLOSED',
            'Pick list tidak sedang menunggu pengembalian',
          );
        }
        const unresolved = pick.items.filter((i) => i.status === 'DISPATCHED');
        if (unresolved.length > 0 && !input.acceptMissing) {
          const codes = unresolved.map((i) => i.asset.code);
          throw new HttpError(
            409,
            'RETURN_INCOMPLETE',
            `Belum discan kembali: ${codes.join(', ')}`,
            { items: codes },
          );
        }
        // Selisih: item ditandai MISSING (bukan dihapus) dan asetnya diblokir dari alokasi.
        for (const item of unresolved) {
          await tx.pickListItem.update({ where: { id: item.id }, data: { status: 'MISSING' } });
          if (
            RETURNABLE_ASSET_STATUSES.includes(item.asset.status) &&
            item.asset.status !== 'ISSUE_ON_SITE'
          ) {
            await moveAsset(
              tx,
              item.asset,
              'ISSUE_ON_SITE',
              user.id,
              `Selisih pengembalian (${pick.number})`,
            );
          }
          await tx.scanEvent.create({
            data: {
              action: 'RETURN_MISSING',
              result: 'OK',
              method: 'MANUAL',
              pickListId: id,
              orderId: pick.orderId,
              assetId: item.assetId,
              note: input.note ?? null,
              actorId: user.id,
            },
          });
        }
        const missing = pick.items.filter((i) => i.status === 'MISSING').length + unresolved.length;
        const target = missing === 0 ? 'COMPLETED' : 'ISSUE';
        const now = new Date();
        await tx.pickList.update({
          where: { id },
          data: { status: missing === 0 ? 'RETURNED' : 'RETURN_ISSUE', returnedAt: now },
        });
        if (orderStatus !== target) {
          const from = await claimTransition(tx, pick.orderId, ['IN_PROGRESS', 'ISSUE'], target);
          await recordStatus(
            tx,
            pick.orderId,
            from,
            target,
            user.id,
            missing === 0 ? 'Semua aset kembali' : `Selisih ${missing} aset`,
          );
        }
        const doc = await createHandoverDocument(tx, {
          pickListId: id,
          orderId: pick.orderId,
          type: 'RETURN',
          actor: user,
          note: input.note ?? null,
        });
        await writeAudit(tx, req, {
          action: 'pick_list.return_complete',
          entity: 'pick_list',
          entityId: id,
          before: { status: pick.status },
          after: {
            status: missing === 0 ? 'RETURNED' : 'RETURN_ISSUE',
            missing,
            document: `${doc.number} v${doc.version}`,
          },
        });
      });
      res.json({ data: await respond(id) });
    },
  );

  // ---------- Foto kondisi pengembalian ----------

  router.post(
    '/pick-lists/:id/items/:itemId/photos',
    requireCapability('warehouse.write'),
    express.raw({ type: [...PHOTO_MIME_TYPES], limit: MAX_PHOTO_BYTES }),
    async (req, res) => {
      const id = parseId(req.params.id);
      const itemId = parseId(req.params.itemId);
      const user = currentUser(req);
      const body: unknown = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        throw new HttpError(400, 'INVALID_IMAGE', 'Unggah foto JPEG atau PNG');
      }
      const mime = detectImageMime(body);
      if (!mime || mime !== req.headers['content-type']?.split(';')[0]?.trim()) {
        throw new HttpError(400, 'INVALID_IMAGE', 'Berkas bukan gambar JPEG/PNG yang valid');
      }
      await db.$transaction(async (tx) => {
        await lockPickList(tx, id);
        const item = await tx.pickListItem.findFirst({
          where: { id: itemId, pickListId: id, status: { in: ['RETURNED', 'MISSING'] } },
        });
        if (!item) {
          throw new HttpError(
            409,
            'PHOTO_NOT_ALLOWED',
            'Foto hanya untuk aset yang sudah discan kembali',
          );
        }
        const count = await tx.scanPhoto.count({ where: { itemId } });
        if (count >= MAX_RETURN_PHOTOS) {
          throw new HttpError(409, 'PHOTO_LIMIT', `Maksimal ${MAX_RETURN_PHOTOS} foto per aset`);
        }
        const photo = await tx.scanPhoto.create({
          data: { itemId, mimeType: mime, data: new Uint8Array(body), createdBy: user.id },
          select: { id: true },
        });
        await writeAudit(tx, req, {
          action: 'pick_list.photo',
          entity: 'pick_list',
          entityId: id,
          after: { itemId, photoId: photo.id, bytes: body.length },
        });
      });
      res.status(201).json({ data: await outcome(id, itemId) });
    },
  );

  router.get(
    '/pick-lists/:id/items/:itemId/photos/:photoId',
    requireCapability('warehouse.read'),
    async (req, res) => {
      const photo = await db.scanPhoto.findFirst({
        where: {
          id: parseId(req.params.photoId),
          itemId: parseId(req.params.itemId),
          item: { pickListId: parseId(req.params.id) },
        },
      });
      if (!photo) throw new HttpError(404, 'NOT_FOUND', 'Foto tidak ditemukan');
      res.setHeader('Content-Type', photo.mimeType);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(Buffer.from(photo.data));
    },
  );

  // ---------- Dokumen serah-terima ----------

  async function loadDocument(id: string): Promise<HandoverDocumentDto> {
    const doc = await db.handoverDocument.findUnique({
      where: { id },
      select: { pickListId: true },
    });
    if (!doc) throw new HttpError(404, 'NOT_FOUND', 'Dokumen tidak ditemukan');
    const siblings = await db.handoverDocument.findMany({
      where: { pickListId: doc.pickListId },
      include: pickListInclude.documents.include,
    });
    const dto = (await toDocumentDtos(db, siblings)).find((d) => d.id === id);
    if (!dto) throw new HttpError(404, 'NOT_FOUND', 'Dokumen tidak ditemukan');
    return dto;
  }

  router.get('/handover-documents/:id', requireCapability('warehouse.read'), async (req, res) => {
    res.json({ data: await loadDocument(parseId(req.params.id)) });
  });

  router.get(
    '/handover-documents/:id/pdf',
    requireCapability('warehouse.read'),
    async (req, res) => {
      const id = parseId(req.params.id);
      const dto = await loadDocument(id);
      const stored = await db.documentSignature.findMany({ where: { documentId: id } });
      const bySigner = new Map(stored.map((s) => [s.role, s]));
      const out = dto.type === 'OUT';
      const slot = (role: 'WAREHOUSE' | 'COUNTERPART'): PdfSignature => {
        const sig = bySigner.get(role);
        const title =
          role === 'WAREHOUSE'
            ? out
              ? 'PIC Gudang (Keluar)'
              : 'PIC Gudang (Kembali)'
            : out
              ? 'Penerima / PIC Penyewa atau Lapangan'
              : 'Pengembali / PIC Penyewa atau Lapangan';
        return {
          title,
          name:
            sig?.signerName ??
            (role === 'WAREHOUSE' ? (dto.payload.warehousePic?.name ?? '-') : '-'),
          role: sig ? (PIC_ROLE_LABEL[sig.signerRole] ?? sig.signerRole) : '',
          signedAt: sig?.signedAt.toISOString() ?? null,
          image: sig ? Buffer.from(sig.image) : null,
        };
      };
      const pdf = await buildHandoverPdf({
        number: dto.number,
        version: dto.version,
        type: dto.type,
        payload: dto.payload,
        createdAt: dto.createdAt,
        revisionReason: dto.revisionReason,
        signatures: [slot('WAREHOUSE'), slot('COUNTERPART')],
      });
      await writeAudit(db, req, {
        action: 'handover.pdf',
        entity: 'handover_document',
        entityId: id,
        after: { number: dto.number, version: dto.version },
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${dto.number}-v${dto.version}.pdf"`);
      res.setHeader('Cache-Control', 'no-store');
      res.send(pdf);
    },
  );

  /** Tanda tangan PIC; dokumen sendiri tidak diubah (tanda tangan = baris append-only terpisah). */
  router.post(
    '/handover-documents/:id/sign',
    requireCapability('handover.sign'),
    async (req, res) => {
      const id = parseId(req.params.id);
      const input = documentSignSchema.parse(req.body);
      const user = currentUser(req);
      const png = Buffer.from(input.image.slice(input.image.indexOf(',') + 1), 'base64');
      if (
        png.length === 0 ||
        png.length > MAX_SIGNATURE_BYTES ||
        detectImageMime(png) !== 'image/png'
      ) {
        throw new HttpError(
          400,
          'INVALID_IMAGE',
          'Tanda tangan harus berupa gambar PNG yang valid',
        );
      }
      await db.$transaction(async (tx) => {
        const doc = await tx.handoverDocument.findUnique({
          where: { id },
          include: { signatures: { select: { role: true } } },
        });
        if (!doc) throw new HttpError(404, 'NOT_FOUND', 'Dokumen tidak ditemukan');
        await lockPickList(tx, doc.pickListId);
        const latest = await tx.handoverDocument.aggregate({
          where: { pickListId: doc.pickListId, type: doc.type },
          _max: { version: true },
        });
        if (latest._max.version !== doc.version) {
          throw new HttpError(
            409,
            'DOCUMENT_SUPERSEDED',
            'Dokumen ini sudah digantikan revisi baru',
          );
        }
        if (doc.signatures.some((s) => s.role === input.role)) {
          throw new HttpError(409, 'ALREADY_SIGNED', 'Peran ini sudah menandatangani dokumen');
        }
        const pic = await tx.orderPic.findFirst({
          where: { id: input.picId, orderId: doc.orderId },
        });
        const warehouseRole = doc.type === 'OUT' ? 'WAREHOUSE_OUT' : 'WAREHOUSE_IN';
        const allowed =
          input.role === 'WAREHOUSE'
            ? pic?.role === warehouseRole
            : pic?.role === 'CUSTOMER_PIC' || pic?.role === 'FIELD';
        if (!pic || !allowed) {
          throw new HttpError(
            400,
            'SIGNER_INVALID',
            'PIC tidak sesuai untuk peran penandatangan ini',
          );
        }
        await tx.documentSignature.create({
          data: {
            documentId: id,
            role: input.role,
            picId: pic.id,
            signerName: pic.name,
            signerRole: pic.role,
            image: new Uint8Array(png),
            signedBy: user.id,
          },
        });
        await writeAudit(tx, req, {
          action: 'handover.sign',
          entity: 'handover_document',
          entityId: id,
          after: {
            number: doc.number,
            version: doc.version,
            role: input.role,
            picId: pic.id,
            signer: pic.name,
          },
        });
      });
      res.json({ data: await loadDocument(id) });
    },
  );

  /** Revisi: dokumen lama tidak disentuh; dibuat versi baru (nomor sama) dari kondisi terkini. */
  router.post(
    '/handover-documents/:id/revise',
    requireCapability('warehouse.write'),
    async (req, res) => {
      const id = parseId(req.params.id);
      const { reason } = documentReviseSchema.parse(req.body);
      const user = currentUser(req);
      const newId = await db.$transaction(async (tx) => {
        const doc = await tx.handoverDocument.findUnique({ where: { id } });
        if (!doc) throw new HttpError(404, 'NOT_FOUND', 'Dokumen tidak ditemukan');
        await lockPickList(tx, doc.pickListId);
        const latest = await tx.handoverDocument.aggregate({
          where: { pickListId: doc.pickListId, type: doc.type },
          _max: { version: true },
        });
        if (latest._max.version !== doc.version) {
          throw new HttpError(
            409,
            'DOCUMENT_SUPERSEDED',
            'Hanya versi terbaru yang dapat direvisi',
          );
        }
        const created = await createHandoverDocument(tx, {
          pickListId: doc.pickListId,
          orderId: doc.orderId,
          type: doc.type,
          actor: user,
          revisionReason: reason,
        });
        await writeAudit(tx, req, {
          action: 'handover.revise',
          entity: 'handover_document',
          entityId: created.id,
          before: { number: doc.number, version: doc.version },
          after: { number: created.number, version: created.version, reason },
        });
        return created.id;
      });
      res.status(201).json({ data: await loadDocument(newId) });
    },
  );

  return router;
}
