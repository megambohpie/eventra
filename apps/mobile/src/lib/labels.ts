import type {
  AssetCondition,
  AssetStatus,
  IncidentDecision,
  IncidentStatus,
  IncidentUrgency,
  PickItemStatus,
  PickListStatus,
  ReplacementStatus,
  ServiceTicketStatus,
} from '@eventra/shared';

/** Label bahasa Indonesia untuk enum status (satu tempat; aplikasi mobile belum memakai i18n). */
export const PICK_LIST_STATUS_LABEL: Record<PickListStatus, string> = {
  OPEN: 'Disiapkan',
  VERIFIED: 'Terverifikasi',
  DISPATCHED: 'Sudah keluar',
  RETURNED: 'Dikembalikan',
  RETURN_ISSUE: 'Selisih pengembalian',
  CANCELLED: 'Dibatalkan',
};

export const PICK_ITEM_STATUS_LABEL: Record<PickItemStatus, string> = {
  PICKED: 'Dipilih',
  VERIFIED: 'Terverifikasi',
  DISPATCHED: 'Keluar',
  RETURNED: 'Kembali',
  MISSING: 'Hilang/selisih',
  REMOVED: 'Dilepas',
};

export const CONDITION_LABEL: Record<AssetCondition, string> = {
  EXCELLENT: 'Sangat baik',
  GOOD: 'Baik',
  FAIR: 'Cukup',
  POOR: 'Kurang',
  DAMAGED: 'Rusak',
};

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  AVAILABLE: 'Tersedia',
  RESERVED: 'Dipesan',
  PREPARED: 'Disiapkan',
  CHECKED_OUT: 'Keluar',
  IN_TRANSIT: 'Dalam perjalanan',
  ON_SITE: 'Di lokasi',
  RETURN_PENDING: 'Menunggu kembali',
  IN_SERVICE: 'Servis',
  QUARANTINED: 'Karantina',
  RETIRED: 'Pensiun',
  ISSUE_ON_SITE: 'Bermasalah di lokasi',
};

export const URGENCY_LABEL: Record<IncidentUrgency, string> = {
  LOW: 'Rendah',
  MEDIUM: 'Sedang',
  HIGH: 'Tinggi',
  CRITICAL: 'Kritis',
};

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  DRAFT: 'Draft',
  REPORTED: 'Dilaporkan',
  GUIDANCE_GIVEN: 'Panduan diberikan',
  TECHNICIAN_ASSIGNED: 'Teknisi ditugaskan',
  REPLACEMENT_IN_PROGRESS: 'Penggantian berjalan',
  REPLACED: 'Sudah diganti',
  REJECTED: 'Ditolak',
  CLOSED: 'Selesai',
};

export const DECISION_LABEL: Record<IncidentDecision, string> = {
  GUIDANCE: 'Panduan perbaikan',
  TECHNICIAN: 'Kirim teknisi',
  REJECT: 'Ditolak',
  REPLACE: 'Penggantian aset',
};

export const REPLACEMENT_STATUS_LABEL: Record<ReplacementStatus, string> = {
  PENDING_PICK: 'Menunggu dipilih',
  PICKED: 'Aset dipilih',
  VERIFIED: 'Terverifikasi',
  DISPATCHED: 'Dikirim',
  RECEIVED: 'Diterima',
  CANCELLED: 'Dibatalkan',
};

export const SERVICE_TICKET_STATUS_LABEL: Record<ServiceTicketStatus, string> = {
  OPEN: 'Dibuka',
  IN_PROGRESS: 'Dikerjakan',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};
