import { z } from 'zod';
import { ASSET_CONDITIONS, type AssetCondition } from './assets';
import type { AssetStatus, BadgeVariant } from './status';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

// ---------- Enum & konstanta (TECHNICAL_SPEC §8, PRD FR-20) ----------

export const INCIDENT_URGENCIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type IncidentUrgency = (typeof INCIDENT_URGENCIES)[number];

export const INCIDENT_STATUSES = [
  'DRAFT',
  'REPORTED',
  'GUIDANCE_GIVEN',
  'TECHNICIAN_ASSIGNED',
  'REPLACEMENT_IN_PROGRESS',
  'REPLACED',
  'REJECTED',
  'CLOSED',
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

/**
 * Insiden yang belum tuntas: aset rusak terkait belum lolos pemeriksaan. Selama ada insiden seperti ini
 * (atau tiket servis terbuka), aset tidak boleh kembali AVAILABLE (invarian Fase 05).
 */
export const OPEN_INCIDENT_STATUSES: readonly IncidentStatus[] = [
  'REPORTED',
  'GUIDANCE_GIVEN',
  'TECHNICIAN_ASSIGNED',
  'REPLACEMENT_IN_PROGRESS',
  'REPLACED',
];

/** Status insiden yang masih menunggu keputusan/tindak lanjut admin. */
export const REVIEWABLE_INCIDENT_STATUSES: readonly IncidentStatus[] = [
  'REPORTED',
  'GUIDANCE_GIVEN',
  'TECHNICIAN_ASSIGNED',
];

export const INCIDENT_DECISIONS = ['GUIDANCE', 'TECHNICIAN', 'REJECT', 'REPLACE'] as const;
export type IncidentDecision = (typeof INCIDENT_DECISIONS)[number];

export const SERVICE_TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type ServiceTicketStatus = (typeof SERVICE_TICKET_STATUSES)[number];

export const INSPECTION_RESULTS = ['PASSED', 'FAILED'] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];

/** Aset yang boleh dibuatkan tiket servis (di gudang atau tindakan teknisi di lokasi). */
export const SERVICEABLE_ASSET_STATUSES: readonly AssetStatus[] = [
  'AVAILABLE',
  'QUARANTINED',
  'ISSUE_ON_SITE',
];

export const REPLACEMENT_STATUSES = [
  'PENDING_PICK',
  'PICKED',
  'VERIFIED',
  'DISPATCHED',
  'RECEIVED',
  'CANCELLED',
] as const;
export type ReplacementStatus = (typeof REPLACEMENT_STATUSES)[number];

/** Status aset yang dapat dilaporkan rusak dari lapangan (sedang di luar gudang dan belum bermasalah). */
export const REPORTABLE_ASSET_STATUSES: readonly AssetStatus[] = [
  'CHECKED_OUT',
  'IN_TRANSIT',
  'ON_SITE',
  'RETURN_PENDING',
];

export const MAX_INCIDENT_PHOTOS = 5;

export const INCIDENT_STATUS_BADGE: Record<IncidentStatus, BadgeVariant> = {
  DRAFT: 'neutral',
  REPORTED: 'error',
  GUIDANCE_GIVEN: 'warning',
  TECHNICIAN_ASSIGNED: 'warning',
  REPLACEMENT_IN_PROGRESS: 'info',
  REPLACED: 'primary',
  REJECTED: 'neutral',
  CLOSED: 'success',
};

export const INCIDENT_URGENCY_BADGE: Record<IncidentUrgency, BadgeVariant> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'error',
};

export const SERVICE_TICKET_STATUS_BADGE: Record<ServiceTicketStatus, BadgeVariant> = {
  OPEN: 'warning',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};

export const REPLACEMENT_STATUS_BADGE: Record<ReplacementStatus, BadgeVariant> = {
  PENDING_PICK: 'warning',
  PICKED: 'info',
  VERIFIED: 'info',
  DISPATCHED: 'primary',
  RECEIVED: 'success',
  CANCELLED: 'neutral',
};

// ---------- Skema request ----------

const qrToken = z.string().trim().min(16).max(64);
const assetCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{3,40}$/);
const rupiah = z.number().int().min(0).max(100_000_000_000);

/** Aset dilaporkan lewat scan QR (utama) atau kode aset (manual bila QR rusak/tak terbaca). */
export const incidentCreateSchema = z
  .object({
    qrToken: qrToken.optional(),
    assetCode: assetCode.optional(),
    urgency: z.enum(INCIDENT_URGENCIES),
    description: z.string().trim().min(5).max(2000),
    locationNote: optionalText(300),
  })
  .refine((v) => Boolean(v.qrToken) !== Boolean(v.assetCode), {
    path: ['qrToken'],
    message: 'Isi tepat satu: token QR atau kode aset',
  });
export type IncidentCreateInput = z.input<typeof incidentCreateSchema>;

export const incidentListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(INCIDENT_STATUSES).optional(),
  urgency: z.enum(INCIDENT_URGENCIES).optional(),
  assetId: z.uuid().optional(),
});
export type IncidentListQuery = z.input<typeof incidentListQuerySchema>;

/** Keputusan admin: panduan perbaikan, kunjungan teknisi, tolak (alasan wajib), atau penggantian. */
export const incidentReviewSchema = z
  .object({
    decision: z.enum(INCIDENT_DECISIONS),
    note: optionalText(1000),
    technicianName: optionalText(120),
  })
  .superRefine((v, ctx) => {
    if ((v.decision === 'GUIDANCE' || v.decision === 'REJECT') && (v.note?.length ?? 0) < 3) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'Catatan wajib diisi' });
    }
    if (v.decision === 'TECHNICIAN' && !v.technicianName) {
      ctx.addIssue({ code: 'custom', path: ['technicianName'], message: 'Teknisi wajib diisi' });
    }
  });
export type IncidentReviewInput = z.input<typeof incidentReviewSchema>;

export const incidentCloseSchema = z.object({
  note: z.string().trim().min(3).max(1000),
  /** Kondisi aset setelah ditangani di lokasi (tidak boleh rusak). */
  condition: z.enum(ASSET_CONDITIONS).optional(),
});
export type IncidentCloseInput = z.input<typeof incidentCloseSchema>;

export const serviceTicketCreateSchema = z.object({
  assetId: z.uuid(),
  incidentId: z.uuid().optional(),
  complaint: z.string().trim().min(3).max(1000),
  vendor: optionalText(160),
});
export type ServiceTicketCreateInput = z.input<typeof serviceTicketCreateSchema>;

export const serviceTicketListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(SERVICE_TICKET_STATUSES).optional(),
  assetId: z.uuid().optional(),
});
export type ServiceTicketListQuery = z.input<typeof serviceTicketListQuerySchema>;

export const serviceTicketStartSchema = z.object({ vendor: optionalText(160) });
export type ServiceTicketStartInput = z.input<typeof serviceTicketStartSchema>;

export const serviceTicketCompleteSchema = z.object({
  actionTaken: z.string().trim().min(3).max(1000),
  cost: rupiah.optional(),
  inspection: z.enum(INSPECTION_RESULTS),
  inspectionNote: optionalText(500),
  conditionAfter: z.enum(ASSET_CONDITIONS),
});
export type ServiceTicketCompleteInput = z.input<typeof serviceTicketCompleteSchema>;

export const serviceTicketCancelSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export type ServiceTicketCancelInput = z.input<typeof serviceTicketCancelSchema>;

export const replacementListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(REPLACEMENT_STATUSES).optional(),
});
export type ReplacementListQuery = z.input<typeof replacementListQuerySchema>;

export const replacementReceiveSchema = z.object({
  qrToken,
  condition: z.enum(ASSET_CONDITIONS),
  note: optionalText(500),
});
export type ReplacementReceiveInput = z.input<typeof replacementReceiveSchema>;

export const replacementCancelSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export type ReplacementCancelInput = z.input<typeof replacementCancelSchema>;

// ---------- DTO ----------

export interface ServiceTicketDto {
  id: string;
  number: string;
  assetId: string;
  assetCode: string;
  productName: string;
  incidentId: string | null;
  incidentNumber: string | null;
  complaint: string;
  status: ServiceTicketStatus;
  vendor: string | null;
  /** Hanya ada bila pemanggil memiliki capability `asset.cost.read`. */
  cost?: number | null;
  actionTaken: string | null;
  inspection: InspectionResult | null;
  inspectionNote: string | null;
  conditionBefore: AssetCondition;
  conditionAfter: AssetCondition | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface ReplacementTaskDto {
  id: string;
  number: string;
  status: ReplacementStatus;
  incidentId: string;
  incidentNumber: string;
  urgency: IncidentUrgency;
  orderId: string;
  orderNumber: string;
  eventLocation: string;
  productId: string;
  productName: string;
  oldAsset: { id: string; code: string };
  replacementAsset: { id: string; code: string } | null;
  pickedAt: string | null;
  verifiedAt: string | null;
  dispatchedAt: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
  receiveCondition: AssetCondition | null;
  receiveNote: string | null;
  createdAt: string;
}

export interface IncidentEventDto {
  id: string;
  fromStatus: IncidentStatus | null;
  toStatus: IncidentStatus;
  note: string | null;
  actor: string | null;
  createdAt: string;
}

export interface IncidentSummaryDto {
  id: string;
  number: string;
  status: IncidentStatus;
  urgency: IncidentUrgency;
  assetId: string;
  assetCode: string;
  productName: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  eventLocation: string;
  reporter: string;
  photoCount: number;
  replacementStatus: ReplacementStatus | null;
  reportedAt: string | null;
  createdAt: string;
}

export interface IncidentDto extends IncidentSummaryDto {
  description: string;
  locationNote: string | null;
  assetStatus: AssetStatus;
  assetCondition: AssetCondition;
  decision: IncidentDecision | null;
  decisionNote: string | null;
  technicianName: string | null;
  reviewer: string | null;
  reviewedAt: string | null;
  closeNote: string | null;
  closedAt: string | null;
  photoIds: string[];
  events: IncidentEventDto[];
  serviceTickets: ServiceTicketDto[];
  replacement: ReplacementTaskDto | null;
}

export interface NotificationDto {
  id: string;
  type: string;
  entity: string;
  entityId: string;
  params: Record<string, string>;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListDto {
  items: NotificationDto[];
  unread: number;
}

export const NOTIFICATION_TYPES = [
  'incident.reported',
  'incident.reviewed',
  'replacement.created',
  'replacement.dispatched',
  'replacement.received',
  'invoice.reminder',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
