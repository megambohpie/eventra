import { Router } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  pickScanSchema,
  replacementCancelSchema,
  replacementListQuerySchema,
  replacementReceiveSchema,
  type Page,
  type ReplacementTaskDto,
  type ScanAction,
  type ScanMethod,
} from '@eventra/shared';
import { writeAudit } from '../audit';
import {
  currentUser,
  requireAnyCapability,
  requireCapability,
  type AuthUser,
} from '../auth/middleware';
import { HttpError } from '../errors';
import { parseId } from '../http';
import { guardedScan, resolveAsset } from '../incidents/scan';
import {
  fieldPicOf,
  fieldPicUserIds,
  loadReplacement,
  lockIncident,
  notify,
  recordIncidentStatus,
  replacementInclude,
  toReplacementDtos,
  usersWithCapability,
  type Tx,
} from '../incidents/service';
import { ScanRejected, lockPickList, moveAsset, recordAssetEvent } from '../warehouse/service';

/** PIC lapangan hanya melihat tugas pada pesanan tempat ia ditugaskan. */
function scopeFor(user: AuthUser): Prisma.ReplacementTaskWhereInput {
  return user.role === 'FIELD_PIC'
    ? { order: { pics: { some: { role: 'FIELD', userId: user.id } } } }
    : {};
}

export function replacementsRouter(db: PrismaClient): Router {
  const router = Router();

  const respond = async (id: string): Promise<ReplacementTaskDto> => {
    const [dto] = await toReplacementDtos(db, [await loadReplacement(db, id)]);
    if (!dto) throw new HttpError(404, 'NOT_FOUND', 'Tugas penggantian tidak ditemukan');
    return dto;
  };

  /**
   * Semua operasi tugas penggantian mengunci pick list pesanan lebih dulu (urutan yang sama dengan scan
   * gudang), lalu membaca ulang tugas di dalam kunci sehingga transisi status tidak berpapasan.
   */
  async function lockTask(tx: Tx, id: string) {
    const head = await tx.replacementTask.findUnique({
      where: { id },
      select: { pickListId: true },
    });
    if (!head) throw new HttpError(404, 'NOT_FOUND', 'Tugas penggantian tidak ditemukan');
    const orderStatus = await lockPickList(tx, head.pickListId);
    const task = await tx.replacementTask.findUniqueOrThrow({
      where: { id },
      include: { incident: true, oldAsset: true, order: { select: { number: true } } },
    });
    return { task, orderStatus };
  }

  const wrongState = (message: string) => new HttpError(409, 'REPLACEMENT_STATE', message);

  // ---------- Daftar & detail ----------

  router.get(
    '/replacement-tasks',
    requireAnyCapability('warehouse.read', 'incident.read'),
    async (req, res) => {
      const q = replacementListQuerySchema.parse(req.query);
      const where: Prisma.ReplacementTaskWhereInput = {
        AND: [scopeFor(currentUser(req)), q.status ? { status: q.status } : {}],
      };
      const [rows, total] = await Promise.all([
        db.replacementTask.findMany({
          where,
          include: replacementInclude,
          orderBy: [{ createdAt: 'desc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        db.replacementTask.count({ where }),
      ]);
      const data: Page<ReplacementTaskDto> = {
        items: await toReplacementDtos(db, rows),
        total,
        page: q.page,
        pageSize: q.pageSize,
      };
      res.json({ data });
    },
  );

  router.get(
    '/replacement-tasks/:id',
    requireAnyCapability('warehouse.read', 'incident.read'),
    async (req, res) => {
      const id = parseId(req.params.id);
      const visible = await db.replacementTask.findFirst({
        where: { id, ...scopeFor(currentUser(req)) },
        select: { id: true },
      });
      if (!visible) throw new HttpError(404, 'NOT_FOUND', 'Tugas penggantian tidak ditemukan');
      res.json({ data: await respond(id) });
    },
  );

  // ---------- Gudang: pilih & verifikasi aset pengganti ----------

  router.post(
    '/replacement-tasks/:id/scan',
    requireCapability('warehouse.write'),
    async (req, res) => {
      const id = parseId(req.params.id);
      const input = pickScanSchema.parse(req.body);
      const user = currentUser(req);
      const method: ScanMethod = input.qrToken ? 'QR' : 'MANUAL';
      const action: ScanAction =
        input.action === 'PICK' ? 'REPLACEMENT_PICK' : 'REPLACEMENT_VERIFY';
      const head = await db.replacementTask.findUnique({
        where: { id },
        select: { orderId: true, incidentId: true },
      });
      if (!head) throw new HttpError(404, 'NOT_FOUND', 'Tugas penggantian tidak ditemukan');

      await guardedScan(
        db,
        req,
        {
          action,
          method,
          entity: 'replacement_task',
          entityId: id,
          orderId: head.orderId,
          incidentId: head.incidentId,
          replacementTaskId: id,
        },
        async (tx) => {
          const { task } = await lockTask(tx, id);
          const asset = await resolveAsset(tx, input);
          const scanData = {
            result: 'OK' as const,
            method,
            orderId: task.orderId,
            incidentId: task.incidentId,
            replacementTaskId: id,
            assetId: asset.id,
            condition: asset.condition,
            actorId: user.id,
          };

          if (input.action === 'PICK') {
            if (task.status !== 'PENDING_PICK') {
              throw wrongState('Aset pengganti sudah dipilih; lepas dulu untuk memilih ulang');
            }
            if (asset.id === task.oldAssetId) {
              throw new ScanRejected(
                'SCAN_SAME_AS_OLD',
                'Aset pengganti tidak boleh sama dengan aset yang rusak',
                asset.id,
              );
            }
            if (asset.productId !== task.productId) {
              throw new ScanRejected(
                'SCAN_PRODUCT_MISMATCH',
                'Aset pengganti harus berproduk sama dengan aset yang rusak',
                asset.id,
              );
            }
            if (asset.condition === 'DAMAGED') {
              throw new ScanRejected(
                'SCAN_ASSET_DAMAGED',
                'Aset rusak tidak dapat menjadi pengganti',
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
            await moveAsset(tx, asset, 'RESERVED', user.id, `Pengganti ${task.number}`);
            await tx.replacementTask.update({
              where: { id },
              data: { status: 'PICKED', replacementAssetId: asset.id, pickedAt: new Date() },
            });
            await tx.scanEvent.create({ data: { ...scanData, action: 'REPLACEMENT_PICK' } });
            await writeAudit(tx, req, {
              action: 'replacement.pick',
              entity: 'replacement_task',
              entityId: id,
              after: { assetCode: asset.code, method },
            });
            return;
          }

          // VERIFY: wajib QR dan harus aset yang dipilih untuk tugas ini.
          if (task.status !== 'PICKED') {
            throw wrongState('Pilih aset pengganti lebih dulu atau aset sudah diverifikasi');
          }
          if (asset.id !== task.replacementAssetId) {
            throw new ScanRejected(
              'SCAN_NOT_IN_PICK_LIST',
              'Aset ini bukan aset pengganti yang dipilih (tidak sesuai)',
              asset.id,
            );
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
          await moveAsset(tx, asset, 'PREPARED', user.id, `Pengganti terverifikasi ${task.number}`);
          await tx.replacementTask.update({
            where: { id },
            data: { status: 'VERIFIED', verifiedAt: new Date() },
          });
          await tx.scanEvent.create({ data: { ...scanData, action: 'REPLACEMENT_VERIFY' } });
          await writeAudit(tx, req, {
            action: 'replacement.verify',
            entity: 'replacement_task',
            entityId: id,
            after: { assetCode: asset.code },
          });
        },
      );
      res.json({ data: await respond(id) });
    },
  );

  /** Lepas aset pengganti yang salah dipilih (sebelum dikirim); riwayat scan tetap tersimpan. */
  router.delete(
    '/replacement-tasks/:id/asset',
    requireCapability('warehouse.write'),
    async (req, res) => {
      const id = parseId(req.params.id);
      const user = currentUser(req);
      await db.$transaction(async (tx) => {
        const { task } = await lockTask(tx, id);
        if (
          (task.status !== 'PICKED' && task.status !== 'VERIFIED') ||
          task.replacementAssetId === null
        ) {
          throw wrongState('Tidak ada aset pengganti yang dapat dilepas');
        }
        const asset = await tx.asset.findUniqueOrThrow({ where: { id: task.replacementAssetId } });
        await moveAsset(tx, asset, 'AVAILABLE', user.id, `Pengganti ${task.number} dilepas`);
        await tx.replacementTask.update({
          where: { id },
          data: {
            status: 'PENDING_PICK',
            replacementAssetId: null,
            pickedAt: null,
            verifiedAt: null,
          },
        });
        await tx.scanEvent.create({
          data: {
            action: 'REPLACEMENT_UNPICK',
            result: 'OK',
            method: 'MANUAL',
            orderId: task.orderId,
            incidentId: task.incidentId,
            replacementTaskId: id,
            assetId: asset.id,
            actorId: user.id,
          },
        });
        await writeAudit(tx, req, {
          action: 'replacement.unpick',
          entity: 'replacement_task',
          entityId: id,
          after: { assetCode: asset.code },
        });
      });
      res.json({ data: await respond(id) });
    },
  );

  // ---------- Gudang: kirim ----------

  router.post(
    '/replacement-tasks/:id/dispatch',
    requireCapability('warehouse.write'),
    async (req, res) => {
      const id = parseId(req.params.id);
      const user = currentUser(req);
      await db.$transaction(async (tx) => {
        const { task } = await lockTask(tx, id);
        if (task.status !== 'VERIFIED' || task.replacementAssetId === null) {
          throw wrongState('Aset pengganti harus dipilih dan diverifikasi sebelum dikirim');
        }
        const asset = await tx.asset.findUniqueOrThrow({ where: { id: task.replacementAssetId } });
        if (asset.status !== 'PREPARED' || asset.condition === 'DAMAGED') {
          throw new HttpError(
            409,
            'DISPATCH_BLOCKED',
            `Aset pengganti belum sesuai: ${asset.code} ${asset.status}/${asset.condition}`,
          );
        }
        await moveAsset(tx, asset, 'IN_TRANSIT', user.id, `Pengganti ${task.number} dikirim`);
        await tx.replacementTask.update({
          where: { id },
          data: { status: 'DISPATCHED', dispatchedAt: new Date() },
        });
        await tx.scanEvent.create({
          data: {
            action: 'REPLACEMENT_DISPATCH',
            result: 'OK',
            method: 'QR',
            orderId: task.orderId,
            incidentId: task.incidentId,
            replacementTaskId: id,
            assetId: asset.id,
            condition: asset.condition,
            actorId: user.id,
          },
        });
        await notify(tx, [task.incident.reporterId, ...(await fieldPicUserIds(tx, task.orderId))], {
          type: 'replacement.dispatched',
          entity: 'replacement_task',
          entityId: id,
          params: {
            number: task.number,
            assetCode: asset.code,
            orderNumber: task.order.number,
            incidentId: task.incidentId,
          },
          exclude: user.id,
        });
        await writeAudit(tx, req, {
          action: 'replacement.dispatch',
          entity: 'replacement_task',
          entityId: id,
          before: { status: 'VERIFIED' },
          after: { status: 'DISPATCHED', assetCode: asset.code },
        });
      });
      res.json({ data: await respond(id) });
    },
  );

  // ---------- PIC lapangan: terima ----------

  /**
   * Scan QR aset pengganti oleh PIC lapangan. Aset pengganti masuk daftar aset aktif pesanan (item pick
   * list DISPATCHED) sehingga ikut dicocokkan saat pengembalian; insiden menjadi REPLACED.
   */
  router.post(
    '/replacement-tasks/:id/receive',
    requireCapability('replacement.receive'),
    async (req, res) => {
      const id = parseId(req.params.id);
      const input = replacementReceiveSchema.parse(req.body);
      const user = currentUser(req);
      const head = await db.replacementTask.findUnique({
        where: { id },
        select: { orderId: true, incidentId: true },
      });
      if (!head) throw new HttpError(404, 'NOT_FOUND', 'Tugas penggantian tidak ditemukan');
      await guardedScan(
        db,
        req,
        {
          action: 'REPLACEMENT_RECEIVE',
          method: 'QR',
          entity: 'replacement_task',
          entityId: id,
          orderId: head.orderId,
          incidentId: head.incidentId,
          replacementTaskId: id,
        },
        async (tx) => {
          const { task, orderStatus } = await lockTask(tx, id);
          const pic = await fieldPicOf(tx, task.orderId, user.id);
          if (user.role === 'FIELD_PIC' && !pic) {
            throw new ScanRejected(
              'NOT_ASSIGNED',
              'Anda bukan PIC lapangan pada pesanan ini',
              null,
              403,
            );
          }
          if (task.status !== 'DISPATCHED' || task.replacementAssetId === null) {
            throw wrongState('Aset pengganti belum dikirim dari gudang atau sudah diterima');
          }
          if (orderStatus !== 'IN_PROGRESS' && orderStatus !== 'ISSUE') {
            throw new HttpError(409, 'INVALID_ORDER_STATE', 'Pesanan sudah tidak berjalan');
          }
          const pick = await tx.pickList.findUniqueOrThrow({ where: { id: task.pickListId } });
          if (pick.status !== 'DISPATCHED' && pick.status !== 'RETURN_ISSUE') {
            throw new HttpError(
              409,
              'PICK_LIST_CLOSED',
              'Barang pesanan ini sudah selesai dikembalikan',
            );
          }
          const asset = await resolveAsset(tx, { qrToken: input.qrToken });
          if (asset.id !== task.replacementAssetId) {
            throw new ScanRejected(
              'SCAN_WRONG_REPLACEMENT',
              'QR ini bukan aset pengganti yang dikirim untuk tugas ini',
              asset.id,
            );
          }
          if (asset.status !== 'IN_TRANSIT') {
            throw new ScanRejected(
              'SCAN_WRONG_STATE',
              `Aset berstatus ${asset.status}, bukan dalam perjalanan`,
              asset.id,
            );
          }
          if (input.condition === 'DAMAGED') {
            throw new ScanRejected(
              'SCAN_ASSET_DAMAGED',
              'Aset pengganti diterima dalam kondisi rusak; laporkan dan hubungi gudang',
              asset.id,
            );
          }
          const now = new Date();
          await moveAsset(tx, asset, 'ON_SITE', user.id, `Pengganti ${task.number} diterima`, {
            condition: input.condition,
          });
          if (input.condition !== asset.condition) {
            await recordAssetEvent(tx, {
              assetId: asset.id,
              type: 'CONDITION_CHANGED',
              fromCondition: asset.condition,
              toCondition: input.condition,
              note: input.note ?? `Kondisi saat diterima (${task.number})`,
              actorId: user.id,
            });
          }
          await tx.pickListItem.create({
            data: {
              pickListId: task.pickListId,
              assetId: asset.id,
              productId: asset.productId,
              status: 'DISPATCHED',
              verifiedAt: task.verifiedAt,
              dispatchedAt: now,
              dispatchCondition: input.condition,
            },
          });
          await tx.replacementTask.update({
            where: { id },
            data: {
              status: 'RECEIVED',
              receivedAt: now,
              receivedBy: user.id,
              receivedPicId: pic?.id ?? null,
              receiveCondition: input.condition,
              receiveNote: input.note ?? null,
            },
          });
          await tx.scanEvent.create({
            data: {
              action: 'REPLACEMENT_RECEIVE',
              result: 'OK',
              method: 'QR',
              pickListId: task.pickListId,
              orderId: task.orderId,
              incidentId: task.incidentId,
              replacementTaskId: id,
              assetId: asset.id,
              condition: input.condition,
              note: input.note ?? null,
              actorId: user.id,
            },
          });
          await lockIncident(tx, task.incidentId);
          await tx.incident.update({
            where: { id: task.incidentId },
            data: { status: 'REPLACED' },
          });
          await recordIncidentStatus(
            tx,
            task.incidentId,
            'REPLACEMENT_IN_PROGRESS',
            'REPLACED',
            user.id,
            `Pengganti ${asset.code} diterima`,
          );
          await notify(tx, await usersWithCapability(tx, 'incident.review'), {
            type: 'replacement.received',
            entity: 'incident',
            entityId: task.incidentId,
            params: { number: task.incident.number, assetCode: asset.code },
            exclude: user.id,
          });
          await writeAudit(tx, req, {
            action: 'replacement.receive',
            entity: 'replacement_task',
            entityId: id,
            before: { status: 'DISPATCHED' },
            after: {
              status: 'RECEIVED',
              oldAsset: task.oldAsset.code,
              newAsset: asset.code,
              condition: input.condition,
            },
          });
        },
      );
      res.json({ data: await respond(id) });
    },
  );

  // ---------- Batalkan ----------

  /** Batalkan tugas sebelum dikirim: aset pengganti dilepas dan insiden kembali menunggu keputusan. */
  router.post(
    '/replacement-tasks/:id/cancel',
    requireCapability('incident.review'),
    async (req, res) => {
      const id = parseId(req.params.id);
      const { reason } = replacementCancelSchema.parse(req.body);
      const user = currentUser(req);
      await db.$transaction(async (tx) => {
        const { task } = await lockTask(tx, id);
        if (!['PENDING_PICK', 'PICKED', 'VERIFIED'].includes(task.status)) {
          throw wrongState('Tugas yang sudah dikirim atau selesai tidak dapat dibatalkan');
        }
        if (task.replacementAssetId) {
          const asset = await tx.asset.findUniqueOrThrow({
            where: { id: task.replacementAssetId },
          });
          await moveAsset(tx, asset, 'AVAILABLE', user.id, `Tugas ${task.number} dibatalkan`);
        }
        // replacement_asset_id dipertahankan sebagai jejak; indeks unik hanya berlaku untuk tugas aktif.
        await tx.replacementTask.update({
          where: { id },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        });
        await lockIncident(tx, task.incidentId);
        await tx.incident.update({ where: { id: task.incidentId }, data: { status: 'REPORTED' } });
        await recordIncidentStatus(
          tx,
          task.incidentId,
          'REPLACEMENT_IN_PROGRESS',
          'REPORTED',
          user.id,
          `Penggantian dibatalkan: ${reason}`,
        );
        await writeAudit(tx, req, {
          action: 'replacement.cancel',
          entity: 'replacement_task',
          entityId: id,
          before: { status: task.status },
          after: { status: 'CANCELLED', reason },
        });
      });
      res.json({ data: await respond(id) });
    },
  );

  return router;
}
