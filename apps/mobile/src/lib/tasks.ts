import {
  OPEN_INCIDENT_STATUSES,
  hasCapability,
  type BadgeVariant,
  type Capability,
  type IncidentSummaryDto,
  type IncidentUrgency,
  type PickListSummaryDto,
  type ReplacementTaskDto,
  type Role,
} from '@eventra/shared';
import type { Route } from './navigation';

export type TaskKind =
  | 'PICK_LIST_PREPARE'
  | 'PICK_LIST_CHECKOUT'
  | 'PICK_LIST_RETURN'
  | 'REPLACEMENT_PREPARE'
  | 'REPLACEMENT_RECEIVE'
  | 'INCIDENT';

export interface Task {
  key: string;
  kind: TaskKind;
  title: string;
  subtitle: string;
  /** Teks status singkat di kartu (bahasa Indonesia). */
  status: string;
  badge: BadgeVariant;
  /** Lebih besar = lebih mendesak. */
  priority: number;
  route: Route;
  /** Waktu acuan (ISO) untuk pengurutan sekunder. */
  at: string;
}

export interface TaskSources {
  pickLists: PickListSummaryDto[];
  replacements: ReplacementTaskDto[];
  incidents: IncidentSummaryDto[];
}

const URGENCY_PRIORITY: Record<IncidentUrgency, number> = {
  LOW: 10,
  MEDIUM: 20,
  HIGH: 30,
  CRITICAL: 40,
};

/** Sumber data yang boleh diminta peran ini (menghindari 403 yang tak perlu). */
export function taskSourcesFor(role: Role) {
  return {
    pickLists: hasCapability(role, 'warehouse.read'),
    replacements:
      hasCapability(role, 'warehouse.read') || hasCapability(role, 'replacement.receive'),
    incidents: hasCapability(role, 'incident.read'),
  };
}

/**
 * Turunkan "tugas saya" dari data API (tanpa endpoint baru). Aksi tetap dibatasi capability di
 * layar detail dan di API; di sini hanya menentukan apa yang relevan bagi peran tersebut.
 */
export function buildTasks(role: Role, data: Partial<TaskSources>): Task[] {
  const tasks: Task[] = [];

  if (hasCapability(role, 'warehouse.read')) {
    for (const p of data.pickLists ?? []) {
      const base = {
        key: `pl:${p.id}`,
        title: `${p.number} · ${p.customerName}`,
        subtitle: `${p.orderNumber} · ${p.eventLocation}`,
        route: { name: 'pickList', id: p.id } as Route,
        at: p.startDate,
      };
      if (p.status === 'OPEN') {
        tasks.push({
          ...base,
          kind: 'PICK_LIST_PREPARE',
          status: `Siapkan: ${p.verified}/${p.required} terverifikasi`,
          badge: 'warning',
          priority: 50,
        });
      } else if (p.status === 'VERIFIED') {
        tasks.push({
          ...base,
          kind: 'PICK_LIST_CHECKOUT',
          status: 'Siap keluar gudang',
          badge: 'info',
          priority: 55,
        });
      } else if (p.status === 'DISPATCHED') {
        tasks.push({
          ...base,
          kind: 'PICK_LIST_RETURN',
          status: 'Menunggu pengembalian',
          badge: 'primary',
          priority: 45,
        });
      } else if (p.status === 'RETURN_ISSUE') {
        tasks.push({
          ...base,
          kind: 'PICK_LIST_RETURN',
          status: 'Ada selisih pengembalian',
          badge: 'error',
          priority: 80,
        });
      }
    }
  }

  for (const r of data.replacements ?? []) {
    const base = {
      key: `rp:${r.id}`,
      title: `${r.number} · ${r.productName}`,
      subtitle: `${r.orderNumber} · ${r.eventLocation}`,
      route: { name: 'replacement', id: r.id } as Route,
      at: r.createdAt,
      priority: URGENCY_PRIORITY[r.urgency] + 40,
    };
    if (r.status === 'DISPATCHED' && hasCapability(role, 'replacement.receive')) {
      tasks.push({
        ...base,
        kind: 'REPLACEMENT_RECEIVE',
        status: 'Pengganti dalam perjalanan: terima',
        badge: 'primary',
      });
    } else if (
      (r.status === 'PENDING_PICK' || r.status === 'PICKED' || r.status === 'VERIFIED') &&
      hasCapability(role, 'warehouse.read')
    ) {
      tasks.push({
        ...base,
        kind: 'REPLACEMENT_PREPARE',
        status: 'Siapkan aset pengganti',
        badge: 'warning',
      });
    }
  }

  for (const i of data.incidents ?? []) {
    if (i.status !== 'DRAFT' && !OPEN_INCIDENT_STATUSES.includes(i.status)) continue;
    tasks.push({
      key: `inc:${i.id}`,
      kind: 'INCIDENT',
      title: `${i.number} · ${i.assetCode}`,
      subtitle: `${i.productName} · ${i.eventLocation}`,
      status: i.status === 'DRAFT' ? 'Draft: lengkapi foto & kirim' : 'Laporan berjalan',
      badge: i.status === 'DRAFT' ? 'neutral' : 'error',
      priority: URGENCY_PRIORITY[i.urgency] + (i.status === 'DRAFT' ? 60 : 0),
      route: { name: 'incident', id: i.id },
      at: i.reportedAt ?? i.createdAt,
    });
  }

  return tasks.sort((a, b) => b.priority - a.priority || a.at.localeCompare(b.at));
}

/** Menu/aksi yang tampil bagi peran ini; dipakai untuk tab dan tombol. */
export function mobileAccess(role: Role) {
  const can = (c: Capability) => hasCapability(role, c);
  return {
    tasks: can('warehouse.read') || can('incident.read') || can('replacement.receive'),
    incidents: can('incident.read'),
    reportIncident: can('incident.report'),
    scanWarehouse: can('warehouse.write'),
    receiveReplacement: can('replacement.receive'),
    viewDocuments: can('warehouse.read'),
  };
}
