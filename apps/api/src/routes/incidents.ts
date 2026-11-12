import express, { Router, type Request } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  MAX_INCIDENT_PHOTOS,
  MAX_PHOTO_BYTES,
  PHOTO_MIME_TYPES,
  REPORTABLE_ASSET_STATUSES,
  REVIEWABLE_INCIDENT_STATUSES,
  hasCapability,
  incidentCloseSchema,
  incidentCreateSchema,
  incidentListQuerySchema,
  incidentReviewSchema,
  type AssetCondition,
  type AssetStatus,
  type IncidentDto,
  type IncidentSummaryDto,
  type Page,
  type ScanMethod,
} from '@eventra/shared';
import { writeAudit } from '../audit';
import { currentUser, requireCapability, type AuthUser } from '../auth/middleware';
import { HttpError } from '../errors';
import { parseId } from '../http';
import { guardedScan, resolveAsset } from '../incidents/scan';
import {
  activeOrderOf,
  assetBlockers,
  fieldPicOf,
  incidentSummaryInclude,
  loadIncident,
  lockIncident,
  nextIncidentNumber,
  nextReplacementNumber,
  nextServiceTicketNumber,
  notify,
  recordIncidentStatus,
  toIncidentDto,
  toIncidentSummary,
  usersWithCapability,
  type Tx,
} from '../incidents/service';
import {
  ScanRejected,
  detectImageMime,
  lockPickList,
  moveAsset,
  recordAssetEvent,
} from '../warehouse/service';

/** PIC lapangan hanya melihat insiden yang dilaporkannya atau pada pesanan tempat ia ditugaskan. */
function scopeFor(user: AuthUser): Prisma.IncidentWhereInput {
  if (user.role !== 'FIELD_PIC') return {};
  return {
    OR: [
      { reporterId: user.id },
      { order: { pics: { some: { role: 'FIELD', userId: user.id } } } },
    ],
  };
}

export function incidentsRouter(db: PrismaClient): Router {
  const router = Router();
  const canSeeCost = (req: Request) => hasCapability(currentUser(req).role, 'asset.cost.read');

  /** Muat insiden (404 bila di luar cakupan pengguna) dan kembalikan DTO lengkap. */
  const respond = async (req: Request, id: string): Promise<IncidentDto> => {
    const user = currentUser(req);
    const visible = await db.incident.findFirst({
      where: { id, ...scopeFor(user) },
      select: { id: true },
    });
    if (!visible) throw new HttpError(404, 'NOT_FOUND', 'Insiden tidak ditemukan');
    return toIncidentDto(db, await loadIncident(db, id), canSeeCost(req));
  };

  /** Pengunggah foto/pengirim laporan: pelapor sendiri atau pemegang izin review. */
  function assertOwnerOrReviewer(
    user: AuthUser,
    incident: { reporterId: string },
    action: string,
  ): void {
    if (incident.reporterId !== user.id && !hasCapability(user.role, 'incident.review')) {
      throw new HttpError(403, 'FORBIDDEN', `Hanya pelapor yang dapat ${action}`);
    }
  }

  // ---------- Daftar & detail ----------

  router.get('/incidents', requireCapability('incident.read'), async (req, res) => {
    const q = incidentListQuerySchema.parse(req.query);
    const user = currentUser(req);
    const and: Prisma.IncidentWhereInput[] = [scopeFor(user)];
    // Draft milik pelapor tidak perlu dilihat orang lain (belum dikirim).
    and.push({ OR: [{ status: { not: 'DRAFT' } }, { reporterId: user.id }] });
    if (q.status) and.push({ status: q.status });
    if (q.urgency) and.push({ urgency: q.urgency });
    if (q.assetId) and.push({ assetId: q.assetId });
    if (q.q) {
      and.push({
        OR: [
          { number: { contains: q.q, mode: 'insensitive' } },
          { asset: { code: { contains: q.q, mode: 'insensitive' } } },
          { order: { number: { contains: q.q, mode: 'insensitive' } } },
          { description: { contains: q.q, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.IncidentWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      db.incident.findMany({
        where,
        include: incidentSummaryInclude,
        orderBy: [{ createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.incident.count({ where }),
    ]);
    const data: Page<IncidentSummaryDto> = {
      items: rows.map(toIncidentSummary),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
    res.json({ data });
  });

  router.get('/incidents/:id', requireCapability('incident.read'), async (req, res) => {
    res.json({ data: await respond(req, parseId(req.params.id)) });
  });

  // ---------- Lapor (scan aset rusak) ----------

  /** Draft laporan: aset ditemukan lewat scan QR/kode. Aset baru ditandai bermasalah saat laporan dikirim. */
  router.post('/incidents', requireCapability('incident.report'), async (req, res) => {
    const input = incidentCreateSchema.parse(req.body);
    const user = currentUser(req);
    const method: ScanMethod = input.qrToken ? 'QR' : 'MANUAL';
    const id = await guardedScan(
      db,
      req,
      { action: 'INCIDENT_SCAN', method, entity: 'incident' },
      async (tx) => {
        const asset = await resolveAsset(tx, input);
        if (asset.status === 'ISSUE_ON_SITE') {
          throw new ScanRejected(
            'ASSET_ALREADY_REPORTED',
            'Aset ini sudah memiliki laporan masalah',
            asset.id,
          );
        }
        if (!REPORTABLE_ASSET_STATUSES.includes(asset.status)) {
          throw new ScanRejected(
            'SCAN_WRONG_STATE',
            `Aset berstatus ${asset.status}, tidak sedang di luar gudang`,
            asset.id,
          );
        }
        const active = await activeOrderOf(tx, asset.id);
        if (!active) {
          throw new ScanRejected(
            'ASSET_NOT_ON_ORDER',
            'Aset ini tidak tercatat pada pesanan yang sedang berjalan',
            asset.id,
          );
        }
        if (user.role === 'FIELD_PIC' && !(await fieldPicOf(tx, active.orderId, user.id))) {
          throw new ScanRejected(
            'NOT_ASSIGNED',
            'Anda bukan PIC lapangan pada pesanan aset ini',
            asset.id,
            403,
          );
        }
        const open = await assetBlockers(tx, asset.id);
        if (open.incident) {
          throw new ScanRejected(
            'ASSET_ALREADY_REPORTED',
            `Aset sudah punya insiden ${open.incident.number}`,
            asset.id,
          );
        }
        const incident = await tx.incident.create({
          data: {
            number: await nextIncidentNumber(tx),
            assetId: asset.id,
            orderId: active.orderId,
            pickListId: active.pickListId,
            reporterId: user.id,
            urgency: input.urgency,
            description: input.description,
            locationNote: input.locationNote ?? null,
          },
        });
        await recordIncidentStatus(tx, incident.id, null, 'DRAFT', user.id, 'Draft dibuat');
        await tx.scanEvent.create({
          data: {
            action: 'INCIDENT_SCAN',
            result: 'OK',
            method,
            orderId: active.orderId,
            pickListId: active.pickListId,
            assetId: asset.id,
            condition: asset.condition,
            incidentId: incident.id,
            actorId: user.id,
          },
        });
        await writeAudit(tx, req, {
          action: 'incident.create',
          entity: 'incident',
          entityId: incident.id,
          after: { number: incident.number, assetCode: asset.code, urgency: input.urgency },
        });
        return incident.id;
      },
    );
    res.status(201).json({ data: await respond(req, id) });
  });

  // ---------- Foto (1–5, ditegakkan backend) ----------

  router.post(
    '/incidents/:id/photos',
    requireCapability('incident.report'),
    express.raw({ type: [...PHOTO_MIME_TYPES], limit: MAX_PHOTO_BYTES }),
    async (req, res) => {
      const id = parseId(req.params.id);
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
        await lockIncident(tx, id);
        const incident = await tx.incident.findUniqueOrThrow({ where: { id } });
        assertOwnerOrReviewer(user, incident, 'mengunggah foto');
        if (incident.status !== 'DRAFT') {
          throw new HttpError(
            409,
            'PHOTO_NOT_ALLOWED',
            'Foto hanya dapat ditambahkan sebelum laporan dikirim',
          );
        }
        const count = await tx.incidentPhoto.count({ where: { incidentId: id } });
        if (count >= MAX_INCIDENT_PHOTOS) {
          throw new HttpError(
            409,
            'PHOTO_LIMIT',
            `Maksimal ${MAX_INCIDENT_PHOTOS} foto per insiden`,
          );
        }
        const photo = await tx.incidentPhoto.create({
          data: { incidentId: id, mimeType: mime, data: new Uint8Array(body), createdBy: user.id },
          select: { id: true },
        });
        await writeAudit(tx, req, {
          action: 'incident.photo',
          entity: 'incident',
          entityId: id,
          after: { photoId: photo.id, bytes: body.length },
        });
      });
      res.status(201).json({ data: await respond(req, id) });
    },
  );

  router.get(
    '/incidents/:id/photos/:photoId',
    requireCapability('incident.read'),
    async (req, res) => {
      const id = parseId(req.params.id);
      await respond(req, id); // memastikan insiden dalam cakupan pengguna
      const photo = await db.incidentPhoto.findFirst({
        where: { id: parseId(req.params.photoId), incidentId: id },
      });
      if (!photo) throw new HttpError(404, 'NOT_FOUND', 'Foto tidak ditemukan');
      res.setHeader('Content-Type', photo.mimeType);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(Buffer.from(photo.data));
    },
  );

  // ---------- Kirim laporan ----------

  /** DRAFT → REPORTED: wajib 1–5 foto; aset ditandai ISSUE_ON_SITE/DAMAGED dan admin diberi notifikasi. */
  router.post('/incidents/:id/submit', requireCapability('incident.report'), async (req, res) => {
    const id = parseId(req.params.id);
    const user = currentUser(req);
    await db.$transaction(async (tx) => {
      const head = await tx.incident.findUnique({ where: { id }, select: { pickListId: true } });
      if (!head) throw new HttpError(404, 'NOT_FOUND', 'Insiden tidak ditemukan');
      // Urutan kunci: pick list lalu insiden (sama di semua rute; bebas deadlock).
      await lockPickList(tx, head.pickListId);
      await lockIncident(tx, id);
      const incident = await tx.incident.findUniqueOrThrow({
        where: { id },
        include: { asset: true },
      });
      assertOwnerOrReviewer(user, incident, 'mengirim laporan');
      if (incident.status !== 'DRAFT') {
        throw new HttpError(409, 'INVALID_INCIDENT_STATE', 'Laporan sudah dikirim');
      }
      const photos = await tx.incidentPhoto.count({ where: { incidentId: id } });
      if (photos < 1 || photos > MAX_INCIDENT_PHOTOS) {
        throw new HttpError(
          422,
          'PHOTOS_REQUIRED',
          `Laporan wajib memiliki 1–${MAX_INCIDENT_PHOTOS} foto`,
        );
      }
      const { asset } = incident;
      if (!REPORTABLE_ASSET_STATUSES.includes(asset.status)) {
        throw new HttpError(
          409,
          'ASSET_STATE_CHANGED',
          `Aset kini berstatus ${asset.status}; laporan tidak dapat dikirim`,
        );
      }
      const open = await assetBlockers(tx, asset.id);
      if (open.incident) {
        throw new HttpError(
          409,
          'ASSET_ALREADY_REPORTED',
          `Aset sudah punya insiden ${open.incident.number}`,
        );
      }
      await moveAsset(tx, asset, 'ISSUE_ON_SITE', user.id, `Insiden ${incident.number}`, {
        condition: 'DAMAGED',
      });
      if (asset.condition !== 'DAMAGED') {
        await recordAssetEvent(tx, {
          assetId: asset.id,
          type: 'CONDITION_CHANGED',
          fromCondition: asset.condition,
          toCondition: 'DAMAGED',
          note: `Dilaporkan rusak (${incident.number})`,
          actorId: user.id,
        });
      }
      await tx.incident.update({
        where: { id },
        data: {
          status: 'REPORTED',
          reportedAt: new Date(),
          assetStatusBefore: asset.status,
          assetConditionBefore: asset.condition,
        },
      });
      await recordIncidentStatus(tx, id, 'DRAFT', 'REPORTED', user.id, 'Laporan dikirim');
      await notify(tx, await usersWithCapability(tx, 'incident.review'), {
        type: 'incident.reported',
        entity: 'incident',
        entityId: id,
        params: {
          number: incident.number,
          assetCode: asset.code,
          urgency: incident.urgency,
        },
        exclude: user.id,
      });
      await writeAudit(tx, req, {
        action: 'incident.submit',
        entity: 'incident',
        entityId: id,
        before: { status: 'DRAFT' },
        after: { status: 'REPORTED', photos, assetStatus: 'ISSUE_ON_SITE' },
      });
    });
    res.json({ data: await respond(req, id) });
  });

  // ---------- Review admin ----------

  /** Batalkan tiket servis di lokasi yang belum berjalan; tiket yang sedang dikerjakan menahan perubahan. */
  async function releaseOnSiteTickets(tx: Tx, assetId: string, note: string): Promise<void> {
    const tickets = await tx.serviceTicket.findMany({
      where: {
        assetId,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        assetStatusBefore: 'ISSUE_ON_SITE',
      },
    });
    if (tickets.some((t) => t.status === 'IN_PROGRESS')) {
      throw new HttpError(
        409,
        'TICKET_IN_PROGRESS',
        'Tiket servis sedang dikerjakan; selesaikan atau batalkan tiket lebih dulu',
      );
    }
    for (const t of tickets) {
      await tx.serviceTicket.update({
        where: { id: t.id },
        data: { status: 'CANCELLED', actionTaken: `Dibatalkan: ${note}` },
      });
    }
  }

  /** Kembalikan aset ke status/kondisi sebelum insiden (laporan ditolak atau selesai ditangani di lokasi). */
  async function restoreAsset(
    tx: Tx,
    incident: {
      assetId: string;
      assetStatusBefore: AssetStatus | null;
      assetConditionBefore: AssetCondition | null;
    },
    actorId: string,
    note: string,
    condition: AssetCondition,
  ): Promise<void> {
    const asset = await tx.asset.findUniqueOrThrow({ where: { id: incident.assetId } });
    // Aset yang sudah ditarik ke gudang (karantina) dibiarkan; admin menanganinya lewat tiket servis.
    if (asset.status !== 'ISSUE_ON_SITE') return;
    const to = incident.assetStatusBefore ?? 'ON_SITE';
    await moveAsset(tx, asset, to, actorId, note, { condition });
    if (condition !== asset.condition) {
      await recordAssetEvent(tx, {
        assetId: asset.id,
        type: 'CONDITION_CHANGED',
        fromCondition: asset.condition,
        toCondition: condition,
        note,
        actorId,
      });
    }
  }

  router.post('/incidents/:id/review', requireCapability('incident.review'), async (req, res) => {
    const id = parseId(req.params.id);
    const input = incidentReviewSchema.parse(req.body);
    const user = currentUser(req);
    await db.$transaction(async (tx) => {
      const head = await tx.incident.findUnique({ where: { id }, select: { pickListId: true } });
      if (!head) throw new HttpError(404, 'NOT_FOUND', 'Insiden tidak ditemukan');
      const orderStatus = await lockPickList(tx, head.pickListId);
      await lockIncident(tx, id);
      const incident = await tx.incident.findUniqueOrThrow({
        where: { id },
        include: { asset: true },
      });
      if (!REVIEWABLE_INCIDENT_STATUSES.includes(incident.status)) {
        throw new HttpError(
          409,
          'INVALID_INCIDENT_STATE',
          'Insiden tidak sedang menunggu keputusan',
        );
      }
      const from = incident.status;
      const note = input.note ?? null;
      const base = {
        decision: input.decision,
        decisionNote: note,
        reviewedBy: user.id,
        reviewedAt: new Date(),
      };
      let to: Prisma.IncidentUpdateInput['status'];
      let detail: Record<string, unknown> = {};

      if (input.decision === 'GUIDANCE') {
        to = 'GUIDANCE_GIVEN';
        await tx.incident.update({ where: { id }, data: { ...base, status: to } });
      } else if (input.decision === 'TECHNICIAN') {
        to = 'TECHNICIAN_ASSIGNED';
        await tx.incident.update({
          where: { id },
          data: { ...base, status: to, technicianName: input.technicianName ?? null },
        });
        // Kunjungan teknisi dicatat sebagai tiket servis yang tertaut ke insiden (aset tetap di lokasi).
        const open = await tx.serviceTicket.findFirst({
          where: { assetId: incident.assetId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
        });
        if (open) {
          await tx.serviceTicket.update({
            where: { id: open.id },
            data: { vendor: input.technicianName ?? open.vendor, incidentId: id },
          });
          detail = { ticket: open.number };
        } else {
          const ticket = await tx.serviceTicket.create({
            data: {
              number: await nextServiceTicketNumber(tx),
              assetId: incident.assetId,
              incidentId: id,
              complaint: incident.description,
              vendor: input.technicianName ?? null,
              conditionBefore: incident.asset.condition,
              assetStatusBefore: incident.asset.status,
              createdBy: user.id,
            },
          });
          detail = { ticket: ticket.number };
        }
      } else if (input.decision === 'REJECT') {
        to = 'REJECTED';
        await releaseOnSiteTickets(tx, incident.assetId, note ?? 'Laporan ditolak');
        await tx.incident.update({
          where: { id },
          data: { ...base, status: to, closedAt: new Date(), closeNote: note },
        });
        await restoreAsset(
          tx,
          incident,
          user.id,
          `Laporan ${incident.number} ditolak`,
          incident.assetConditionBefore ?? 'GOOD',
        );
      } else {
        if (!['IN_PROGRESS', 'ISSUE'].includes(orderStatus)) {
          throw new HttpError(
            409,
            'INVALID_ORDER_STATE',
            'Penggantian hanya untuk pesanan yang sedang berjalan',
          );
        }
        const pick = await tx.pickList.findUniqueOrThrow({ where: { id: head.pickListId } });
        if (pick.status !== 'DISPATCHED' && pick.status !== 'RETURN_ISSUE') {
          throw new HttpError(
            409,
            'PICK_LIST_CLOSED',
            'Barang pesanan ini sudah selesai dikembalikan',
          );
        }
        await releaseOnSiteTickets(tx, incident.assetId, 'Diganti dengan aset pengganti');
        to = 'REPLACEMENT_IN_PROGRESS';
        await tx.incident.update({ where: { id }, data: { ...base, status: to } });
        const task = await tx.replacementTask.create({
          data: {
            number: await nextReplacementNumber(tx),
            incidentId: id,
            orderId: incident.orderId,
            pickListId: incident.pickListId,
            oldAssetId: incident.assetId,
            productId: incident.asset.productId,
            createdBy: user.id,
          },
        });
        detail = { replacement: task.number };
        await notify(tx, await usersWithCapability(tx, 'warehouse.write'), {
          type: 'replacement.created',
          entity: 'replacement_task',
          entityId: task.id,
          params: { number: task.number, incidentNumber: incident.number },
          exclude: user.id,
        });
      }

      await recordIncidentStatus(tx, id, from, to as typeof from, user.id, note);
      await notify(tx, [incident.reporterId], {
        type: 'incident.reviewed',
        entity: 'incident',
        entityId: id,
        params: { number: incident.number, decision: input.decision },
        exclude: user.id,
      });
      await writeAudit(tx, req, {
        action: 'incident.review',
        entity: 'incident',
        entityId: id,
        before: { status: from },
        after: { status: to, decision: input.decision, ...detail },
      });
    });
    res.json({ data: await respond(req, id) });
  });

  /**
   * Tutup insiden. Dari GUIDANCE_GIVEN/TECHNICIAN_ASSIGNED = masalah teratasi di lokasi (aset kembali ke
   * status semula dengan kondisi yang tidak rusak). Dari REPLACED hanya bila aset lama sudah pensiun;
   * jalur normalnya ditutup otomatis saat tiket servis aset itu lolos pemeriksaan.
   */
  router.post('/incidents/:id/close', requireCapability('incident.review'), async (req, res) => {
    const id = parseId(req.params.id);
    const input = incidentCloseSchema.parse(req.body);
    const user = currentUser(req);
    await db.$transaction(async (tx) => {
      const head = await tx.incident.findUnique({ where: { id }, select: { pickListId: true } });
      if (!head) throw new HttpError(404, 'NOT_FOUND', 'Insiden tidak ditemukan');
      await lockPickList(tx, head.pickListId);
      await lockIncident(tx, id);
      const incident = await tx.incident.findUniqueOrThrow({
        where: { id },
        include: { asset: true },
      });
      const from = incident.status;
      if (from === 'REPLACED') {
        if (incident.asset.status !== 'RETIRED') {
          throw new HttpError(
            409,
            'ASSET_NOT_CLEARED',
            'Aset lama harus lolos pemeriksaan servis (atau dipensiunkan) sebelum insiden ditutup',
          );
        }
      } else if (from === 'GUIDANCE_GIVEN' || from === 'TECHNICIAN_ASSIGNED') {
        const condition = input.condition ?? incident.assetConditionBefore ?? 'GOOD';
        if (condition === 'DAMAGED') {
          throw new HttpError(
            400,
            'CONDITION_DAMAGED',
            'Pilih kondisi aset setelah ditangani (tidak boleh rusak)',
          );
        }
        await releaseOnSiteTickets(tx, incident.assetId, 'Insiden ditutup');
        await restoreAsset(
          tx,
          incident,
          user.id,
          `Insiden ${incident.number} tuntas di lokasi`,
          condition,
        );
      } else {
        throw new HttpError(
          409,
          'INVALID_INCIDENT_STATE',
          'Insiden tidak dapat ditutup pada status ini',
        );
      }
      await tx.incident.update({
        where: { id },
        data: { status: 'CLOSED', closedAt: new Date(), closeNote: input.note },
      });
      await recordIncidentStatus(tx, id, from, 'CLOSED', user.id, input.note);
      await writeAudit(tx, req, {
        action: 'incident.close',
        entity: 'incident',
        entityId: id,
        before: { status: from },
        after: { status: 'CLOSED', note: input.note },
      });
    });
    res.json({ data: await respond(req, id) });
  });

  return router;
}
