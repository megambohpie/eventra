import type { Prisma, PrismaClient } from '@prisma/client';
import {
  OPEN_INCIDENT_STATUSES,
  ROLE_CAPABILITIES,
  type Capability,
  type IncidentDto,
  type IncidentSummaryDto,
  type NotificationType,
  type ReplacementTaskDto,
  type ServiceTicketDto,
} from '@eventra/shared';
import { HttpError } from '../errors';
import { userNames } from '../warehouse/service';

type Db = PrismaClient | Prisma.TransactionClient;
export type Tx = Prisma.TransactionClient;

// ---------- Penomoran ----------

const year = (date: Date) => date.getUTCFullYear();
const pad = (n: bigint | undefined) => String(n ?? 0).padStart(6, '0');

export async function nextIncidentNumber(tx: Tx, date = new Date()): Promise<string> {
  const rows = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('incident_number_seq') AS n`;
  return `INC-${year(date)}-${pad(rows[0]?.n)}`;
}

export async function nextServiceTicketNumber(tx: Tx, date = new Date()): Promise<string> {
  const rows = await tx.$queryRaw<
    { n: bigint }[]
  >`SELECT nextval('service_ticket_number_seq') AS n`;
  return `SVC-${year(date)}-${pad(rows[0]?.n)}`;
}

export async function nextReplacementNumber(tx: Tx, date = new Date()): Promise<string> {
  const rows = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('replacement_number_seq') AS n`;
  return `RPL-${year(date)}-${pad(rows[0]?.n)}`;
}

// ---------- Kunci ----------

/** Kunci baris insiden (serialisasi foto/submit/review). Selalu diambil SETELAH kunci pick list. */
export async function lockIncident(tx: Tx, id: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM incidents WHERE id = ${id}::uuid FOR UPDATE`;
  if (rows.length === 0) throw new HttpError(404, 'NOT_FOUND', 'Insiden tidak ditemukan');
}

// ---------- Aturan aset ----------

/**
 * Aset yang masih punya insiden belum tuntas atau tiket servis terbuka belum boleh kembali AVAILABLE
 * (belum lolos pemeriksaan). `ignoreTicketId` dipakai saat tiket itu sendiri yang sedang diselesaikan.
 */
export async function assetBlockers(
  db: Db,
  assetId: string,
  ignoreTicketId?: string,
): Promise<{ incident: { id: string; number: string } | null; ticket: { number: string } | null }> {
  const incident = await db.incident.findFirst({
    where: { assetId, status: { in: [...OPEN_INCIDENT_STATUSES] } },
    select: { id: true, number: true },
  });
  const ticket = await db.serviceTicket.findFirst({
    where: {
      assetId,
      status: { in: ['OPEN', 'IN_PROGRESS'] },
      ...(ignoreTicketId ? { id: { not: ignoreTicketId } } : {}),
    },
    select: { number: true },
  });
  return { incident, ticket };
}

export async function assertClearable(db: Db, assetId: string): Promise<void> {
  const { incident, ticket } = await assetBlockers(db, assetId);
  if (incident) {
    throw new HttpError(
      409,
      'ASSET_NOT_CLEARED',
      `Aset masih punya insiden ${incident.number} yang belum tuntas; selesaikan pemeriksaan lebih dulu`,
    );
  }
  if (ticket) {
    throw new HttpError(
      409,
      'ASSET_NOT_CLEARED',
      `Aset masih punya tiket servis ${ticket.number} yang belum selesai`,
    );
  }
}

/** Pesanan/pick list tempat aset sedang berada di luar gudang (item DISPATCHED pada pick list aktif). */
export async function activeOrderOf(
  db: Db,
  assetId: string,
): Promise<{ orderId: string; pickListId: string } | null> {
  const item = await db.pickListItem.findFirst({
    where: {
      assetId,
      status: 'DISPATCHED',
      pickList: { status: { in: ['DISPATCHED', 'RETURN_ISSUE'] } },
    },
    select: { pickListId: true, pickList: { select: { orderId: true } } },
  });
  return item ? { orderId: item.pickList.orderId, pickListId: item.pickListId } : null;
}

/** PIC lapangan yang ditugaskan pada pesanan (peran FIELD dengan pengguna internal terkait). */
export async function fieldPicOf(db: Db, orderId: string, userId: string) {
  return db.orderPic.findFirst({ where: { orderId, role: 'FIELD', userId } });
}

// ---------- Notifikasi ----------

export async function usersWithCapability(db: Db, capability: Capability): Promise<string[]> {
  const roles = (Object.keys(ROLE_CAPABILITIES) as (keyof typeof ROLE_CAPABILITIES)[]).filter((r) =>
    ROLE_CAPABILITIES[r].includes(capability),
  );
  const users = await db.user.findMany({
    where: { active: true, role: { in: roles } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export async function notify(
  db: Db,
  userIds: (string | null | undefined)[],
  input: {
    type: NotificationType;
    entity: string;
    entityId: string;
    params: Record<string, string>;
    exclude?: string;
  },
): Promise<void> {
  const unique = [...new Set(userIds.filter((u): u is string => Boolean(u)))].filter(
    (u) => u !== input.exclude,
  );
  if (unique.length === 0) return;
  await db.notification.createMany({
    data: unique.map((userId) => ({
      userId,
      type: input.type,
      entity: input.entity,
      entityId: input.entityId,
      params: input.params,
    })),
  });
}

/** Pengguna internal yang menjadi PIC lapangan pesanan. */
export async function fieldPicUserIds(db: Db, orderId: string): Promise<string[]> {
  const pics = await db.orderPic.findMany({
    where: { orderId, role: 'FIELD', userId: { not: null } },
    select: { userId: true },
  });
  return pics.map((p) => p.userId).filter((u): u is string => u !== null);
}

// ---------- Include & DTO ----------

export const ticketInclude = {
  asset: { select: { code: true, product: { select: { name: true } } } },
  incident: { select: { number: true } },
} satisfies Prisma.ServiceTicketInclude;
type TicketRow = Prisma.ServiceTicketGetPayload<{ include: typeof ticketInclude }>;

export function toTicketDto(t: TicketRow, withCost: boolean): ServiceTicketDto {
  return {
    id: t.id,
    number: t.number,
    assetId: t.assetId,
    assetCode: t.asset.code,
    productName: t.asset.product.name,
    incidentId: t.incidentId,
    incidentNumber: t.incident?.number ?? null,
    complaint: t.complaint,
    status: t.status,
    vendor: t.vendor,
    ...(withCost ? { cost: t.cost === null ? null : Number(t.cost) } : {}),
    actionTaken: t.actionTaken,
    inspection: t.inspection,
    inspectionNote: t.inspectionNote,
    conditionBefore: t.conditionBefore,
    conditionAfter: t.conditionAfter,
    startedAt: t.startedAt?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
  };
}

export const replacementInclude = {
  incident: { select: { number: true, urgency: true } },
  order: { select: { number: true, eventLocation: true } },
  oldAsset: { select: { id: true, code: true, product: { select: { name: true } } } },
  replacementAsset: { select: { id: true, code: true } },
} satisfies Prisma.ReplacementTaskInclude;
type ReplacementRow = Prisma.ReplacementTaskGetPayload<{ include: typeof replacementInclude }>;

export async function toReplacementDtos(
  db: Db,
  rows: ReplacementRow[],
): Promise<ReplacementTaskDto[]> {
  const names = await userNames(
    db,
    rows.map((r) => r.receivedBy),
  );
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status,
    incidentId: r.incidentId,
    incidentNumber: r.incident.number,
    urgency: r.incident.urgency,
    orderId: r.orderId,
    orderNumber: r.order.number,
    eventLocation: r.order.eventLocation,
    productId: r.productId,
    productName: r.oldAsset.product.name,
    oldAsset: { id: r.oldAsset.id, code: r.oldAsset.code },
    replacementAsset: r.replacementAsset
      ? { id: r.replacementAsset.id, code: r.replacementAsset.code }
      : null,
    pickedAt: r.pickedAt?.toISOString() ?? null,
    verifiedAt: r.verifiedAt?.toISOString() ?? null,
    dispatchedAt: r.dispatchedAt?.toISOString() ?? null,
    receivedAt: r.receivedAt?.toISOString() ?? null,
    receivedBy: r.receivedBy ? (names.get(r.receivedBy) ?? null) : null,
    receiveCondition: r.receiveCondition,
    receiveNote: r.receiveNote,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function loadReplacement(db: Db, id: string): Promise<ReplacementRow> {
  const row = await db.replacementTask.findUnique({ where: { id }, include: replacementInclude });
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Tugas penggantian tidak ditemukan');
  return row;
}

export const incidentSummaryInclude = {
  asset: { select: { code: true, product: { select: { name: true } } } },
  order: { select: { number: true, eventLocation: true, customer: { select: { name: true } } } },
  reporter: { select: { name: true } },
  _count: { select: { photos: true } },
  replacementTasks: { where: { status: { not: 'CANCELLED' } }, select: { status: true } },
} satisfies Prisma.IncidentInclude;
type SummaryRow = Prisma.IncidentGetPayload<{ include: typeof incidentSummaryInclude }>;

export function toIncidentSummary(i: SummaryRow): IncidentSummaryDto {
  return {
    id: i.id,
    number: i.number,
    status: i.status,
    urgency: i.urgency,
    assetId: i.assetId,
    assetCode: i.asset.code,
    productName: i.asset.product.name,
    orderId: i.orderId,
    orderNumber: i.order.number,
    customerName: i.order.customer.name,
    eventLocation: i.order.eventLocation,
    reporter: i.reporter.name,
    photoCount: i._count.photos,
    replacementStatus: i.replacementTasks[0]?.status ?? null,
    reportedAt: i.reportedAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
  };
}

export const incidentInclude = {
  asset: {
    select: { code: true, status: true, condition: true, product: { select: { name: true } } },
  },
  order: { select: { number: true, eventLocation: true, customer: { select: { name: true } } } },
  reporter: { select: { name: true } },
  reviewer: { select: { name: true } },
  photos: { select: { id: true }, orderBy: { createdAt: 'asc' } },
  events: { include: { actor: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
  serviceTickets: { include: ticketInclude, orderBy: { createdAt: 'desc' } },
  replacementTasks: {
    where: { status: { not: 'CANCELLED' } },
    include: replacementInclude,
  },
} satisfies Prisma.IncidentInclude;
type IncidentRow = Prisma.IncidentGetPayload<{ include: typeof incidentInclude }>;

export async function loadIncident(db: Db, id: string): Promise<IncidentRow> {
  const row = await db.incident.findUnique({ where: { id }, include: incidentInclude });
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Insiden tidak ditemukan');
  return row;
}

export async function toIncidentDto(
  db: Db,
  i: IncidentRow,
  withCost: boolean,
): Promise<IncidentDto> {
  const [replacement] = await toReplacementDtos(db, i.replacementTasks);
  return {
    id: i.id,
    number: i.number,
    status: i.status,
    urgency: i.urgency,
    assetId: i.assetId,
    assetCode: i.asset.code,
    productName: i.asset.product.name,
    orderId: i.orderId,
    orderNumber: i.order.number,
    customerName: i.order.customer.name,
    eventLocation: i.order.eventLocation,
    reporter: i.reporter.name,
    photoCount: i.photos.length,
    replacementStatus: replacement?.status ?? null,
    reportedAt: i.reportedAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
    description: i.description,
    locationNote: i.locationNote,
    assetStatus: i.asset.status,
    assetCondition: i.asset.condition,
    decision: i.decision,
    decisionNote: i.decisionNote,
    technicianName: i.technicianName,
    reviewer: i.reviewer?.name ?? null,
    reviewedAt: i.reviewedAt?.toISOString() ?? null,
    closeNote: i.closeNote,
    closedAt: i.closedAt?.toISOString() ?? null,
    photoIds: i.photos.map((p) => p.id),
    events: i.events.map((e) => ({
      id: e.id,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      note: e.note,
      actor: e.actor?.name ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
    serviceTickets: i.serviceTickets.map((t) => toTicketDto(t, withCost)),
    replacement: replacement ?? null,
  };
}

/** Catat perubahan status insiden (append-only). */
export async function recordIncidentStatus(
  tx: Tx,
  incidentId: string,
  from: IncidentRow['status'] | null,
  to: IncidentRow['status'],
  actorId: string | null,
  note?: string | null,
): Promise<void> {
  await tx.incidentEvent.create({
    data: { incidentId, fromStatus: from, toStatus: to, note: note ?? null, actorId },
  });
}
