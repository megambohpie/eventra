import { Router, type Request } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  SERVICEABLE_ASSET_STATUSES,
  hasCapability,
  serviceTicketCancelSchema,
  serviceTicketCompleteSchema,
  serviceTicketCreateSchema,
  serviceTicketListQuerySchema,
  serviceTicketStartSchema,
  type Page,
  type ServiceTicketDto,
} from '@eventra/shared';
import { writeAudit } from '../audit';
import { currentUser, requireCapability } from '../auth/middleware';
import { HttpError } from '../errors';
import { parseId } from '../http';
import {
  assetBlockers,
  nextServiceTicketNumber,
  recordIncidentStatus,
  ticketInclude,
  toTicketDto,
  type Tx,
} from '../incidents/service';
import { moveAsset, recordAssetEvent } from '../warehouse/service';

export function serviceTicketsRouter(db: PrismaClient): Router {
  const router = Router();
  const canSeeCost = (req: Request) => hasCapability(currentUser(req).role, 'asset.cost.read');

  const respond = async (req: Request, id: string): Promise<ServiceTicketDto> => {
    const row = await db.serviceTicket.findUnique({ where: { id }, include: ticketInclude });
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Tiket servis tidak ditemukan');
    return toTicketDto(row, canSeeCost(req));
  };

  /** Kunci baris tiket agar mulai/selesai/batal tidak berpapasan. */
  async function lockTicket(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM service_tickets WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new HttpError(404, 'NOT_FOUND', 'Tiket servis tidak ditemukan');
    return tx.serviceTicket.findUniqueOrThrow({ where: { id }, include: { asset: true } });
  }

  router.get('/service-tickets', requireCapability('service.read'), async (req, res) => {
    const q = serviceTicketListQuerySchema.parse(req.query);
    const and: Prisma.ServiceTicketWhereInput[] = [];
    if (q.status) and.push({ status: q.status });
    if (q.assetId) and.push({ assetId: q.assetId });
    if (q.q) {
      and.push({
        OR: [
          { number: { contains: q.q, mode: 'insensitive' } },
          { complaint: { contains: q.q, mode: 'insensitive' } },
          { vendor: { contains: q.q, mode: 'insensitive' } },
          { asset: { code: { contains: q.q, mode: 'insensitive' } } },
        ],
      });
    }
    const where: Prisma.ServiceTicketWhereInput = { AND: and };
    const withCost = canSeeCost(req);
    const [rows, total] = await Promise.all([
      db.serviceTicket.findMany({
        where,
        include: ticketInclude,
        orderBy: [{ createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.serviceTicket.count({ where }),
    ]);
    const data: Page<ServiceTicketDto> = {
      items: rows.map((t) => toTicketDto(t, withCost)),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
    res.json({ data });
  });

  router.get('/service-tickets/:id', requireCapability('service.read'), async (req, res) => {
    res.json({ data: await respond(req, parseId(req.params.id)) });
  });

  /** Buka tiket servis. Aset di gudang (tersedia/karantina) masuk IN_SERVICE; aset di lokasi tetap ISSUE_ON_SITE. */
  router.post('/service-tickets', requireCapability('service.write'), async (req, res) => {
    const input = serviceTicketCreateSchema.parse(req.body);
    const user = currentUser(req);
    const id = await db.$transaction(async (tx) => {
      const asset = await tx.asset.findUnique({ where: { id: input.assetId } });
      if (!asset) throw new HttpError(400, 'INVALID_REFERENCE', 'Aset tidak ditemukan');
      if (!SERVICEABLE_ASSET_STATUSES.includes(asset.status)) {
        throw new HttpError(
          409,
          'ASSET_NOT_SERVICEABLE',
          `Aset berstatus ${asset.status}; hanya aset tersedia, karantina, atau bermasalah di lokasi yang dapat diservis`,
        );
      }
      if (input.incidentId) {
        const incident = await tx.incident.findUnique({ where: { id: input.incidentId } });
        if (!incident || incident.assetId !== asset.id) {
          throw new HttpError(400, 'INVALID_REFERENCE', 'Insiden tidak sesuai dengan aset');
        }
      }
      const existing = await tx.serviceTicket.findFirst({
        where: { assetId: asset.id, status: { in: ['OPEN', 'IN_PROGRESS'] } },
        select: { number: true },
      });
      if (existing) {
        throw new HttpError(
          409,
          'TICKET_EXISTS',
          `Aset ini sudah punya tiket servis terbuka (${existing.number})`,
        );
      }
      const ticket = await tx.serviceTicket.create({
        data: {
          number: await nextServiceTicketNumber(tx),
          assetId: asset.id,
          incidentId: input.incidentId ?? null,
          complaint: input.complaint,
          vendor: input.vendor ?? null,
          conditionBefore: asset.condition,
          assetStatusBefore: asset.status,
          createdBy: user.id,
        },
      });
      if (asset.status !== 'ISSUE_ON_SITE') {
        await moveAsset(tx, asset, 'IN_SERVICE', user.id, `Tiket servis ${ticket.number}`);
      }
      await writeAudit(tx, req, {
        action: 'service_ticket.create',
        entity: 'service_ticket',
        entityId: ticket.id,
        after: { number: ticket.number, assetCode: asset.code, incidentId: input.incidentId },
      });
      return ticket.id;
    });
    res.status(201).json({ data: await respond(req, id) });
  });

  router.post(
    '/service-tickets/:id/start',
    requireCapability('service.write'),
    async (req, res) => {
      const id = parseId(req.params.id);
      const input = serviceTicketStartSchema.parse(req.body ?? {});
      await db.$transaction(async (tx) => {
        const ticket = await lockTicket(tx, id);
        if (ticket.status !== 'OPEN') {
          throw new HttpError(409, 'INVALID_TICKET_STATE', 'Tiket tidak dalam status terbuka');
        }
        await tx.serviceTicket.update({
          where: { id },
          data: {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            vendor: input.vendor ?? ticket.vendor,
          },
        });
        await writeAudit(tx, req, {
          action: 'service_ticket.start',
          entity: 'service_ticket',
          entityId: id,
          before: { status: 'OPEN' },
          after: { status: 'IN_PROGRESS', vendor: input.vendor ?? ticket.vendor },
        });
      });
      res.json({ data: await respond(req, id) });
    },
  );

  /**
   * Selesaikan servis dengan hasil pemeriksaan. Aset di gudang (IN_SERVICE) hanya kembali AVAILABLE bila
   * LOLOS dan tidak ada insiden terbuka lain; gagal = karantina. Insiden berstatus REPLACED atas aset ini
   * ditutup otomatis oleh pemeriksaan yang lolos.
   */
  router.post(
    '/service-tickets/:id/complete',
    requireCapability('service.write'),
    async (req, res) => {
      const id = parseId(req.params.id);
      const input = serviceTicketCompleteSchema.parse(req.body);
      const user = currentUser(req);
      if (input.inspection === 'PASSED' && input.conditionAfter === 'DAMAGED') {
        throw new HttpError(
          400,
          'INSPECTION_CONDITION',
          'Pemeriksaan lolos tidak sesuai dengan kondisi rusak',
        );
      }
      await db.$transaction(async (tx) => {
        const ticket = await lockTicket(tx, id);
        if (ticket.status !== 'IN_PROGRESS') {
          throw new HttpError(
            409,
            'INVALID_TICKET_STATE',
            'Tiket harus dimulai (dikerjakan) sebelum diselesaikan',
          );
        }
        const asset = ticket.asset;
        let assetStatus = asset.status;
        if (asset.status === 'IN_SERVICE') {
          const passed = input.inspection === 'PASSED';
          if (passed) {
            const replaced = await tx.incident.findMany({
              where: { assetId: asset.id, status: 'REPLACED' },
            });
            for (const incident of replaced) {
              await tx.incident.update({
                where: { id: incident.id },
                data: {
                  status: 'CLOSED',
                  closedAt: new Date(),
                  closeNote: `Lolos pemeriksaan servis ${ticket.number}`,
                },
              });
              await recordIncidentStatus(
                tx,
                incident.id,
                'REPLACED',
                'CLOSED',
                user.id,
                `Lolos pemeriksaan servis ${ticket.number}`,
              );
            }
            const blockers = await assetBlockers(tx, asset.id, id);
            if (blockers.incident) {
              throw new HttpError(
                409,
                'ASSET_NOT_CLEARED',
                `Aset masih punya insiden ${blockers.incident.number} yang belum tuntas`,
              );
            }
          }
          assetStatus = passed ? 'AVAILABLE' : 'QUARANTINED';
          await moveAsset(
            tx,
            asset,
            assetStatus,
            user.id,
            `Servis ${ticket.number} selesai (${input.inspection})`,
            { condition: input.conditionAfter },
          );
          if (input.conditionAfter !== asset.condition) {
            await recordAssetEvent(tx, {
              assetId: asset.id,
              type: 'CONDITION_CHANGED',
              fromCondition: asset.condition,
              toCondition: input.conditionAfter,
              note: `Hasil servis ${ticket.number}`,
              actorId: user.id,
            });
          }
        }
        await tx.serviceTicket.update({
          where: { id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            actionTaken: input.actionTaken,
            cost: input.cost === undefined ? null : BigInt(input.cost),
            inspection: input.inspection,
            inspectionNote: input.inspectionNote ?? null,
            conditionAfter: input.conditionAfter,
          },
        });
        await writeAudit(tx, req, {
          action: 'service_ticket.complete',
          entity: 'service_ticket',
          entityId: id,
          before: { status: 'IN_PROGRESS' },
          after: {
            status: 'COMPLETED',
            inspection: input.inspection,
            conditionAfter: input.conditionAfter,
            assetStatus,
            hasCost: input.cost !== undefined,
          },
        });
      });
      res.json({ data: await respond(req, id) });
    },
  );

  router.post(
    '/service-tickets/:id/cancel',
    requireCapability('service.write'),
    async (req, res) => {
      const id = parseId(req.params.id);
      const { reason } = serviceTicketCancelSchema.parse(req.body);
      const user = currentUser(req);
      await db.$transaction(async (tx) => {
        const ticket = await lockTicket(tx, id);
        if (ticket.status !== 'OPEN' && ticket.status !== 'IN_PROGRESS') {
          throw new HttpError(409, 'INVALID_TICKET_STATE', 'Tiket sudah selesai atau dibatalkan');
        }
        const asset = ticket.asset;
        if (asset.status === 'IN_SERVICE') {
          // Tanpa pemeriksaan, aset hanya boleh tersedia bila sebelumnya tersedia, tidak rusak, dan bersih.
          const blockers = await assetBlockers(tx, asset.id, id);
          const back =
            ticket.assetStatusBefore === 'AVAILABLE' &&
            asset.condition !== 'DAMAGED' &&
            !blockers.incident
              ? 'AVAILABLE'
              : 'QUARANTINED';
          await moveAsset(tx, asset, back, user.id, `Tiket servis ${ticket.number} dibatalkan`);
        }
        await tx.serviceTicket.update({
          where: { id },
          data: { status: 'CANCELLED', actionTaken: `Dibatalkan: ${reason}` },
        });
        await writeAudit(tx, req, {
          action: 'service_ticket.cancel',
          entity: 'service_ticket',
          entityId: id,
          before: { status: ticket.status },
          after: { status: 'CANCELLED', reason },
        });
      });
      res.json({ data: await respond(req, id) });
    },
  );

  return router;
}
