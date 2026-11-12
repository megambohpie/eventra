/** Peran (TECHNICAL_SPEC §3) dan capability. Pemeriksaan akses memakai capability, bukan nama role. */
export const ROLES = [
  'OWNER',
  'ADMIN',
  'OPS_COORDINATOR',
  'WAREHOUSE',
  'FIELD_PIC',
  'CUSTOMER',
] as const;
export type Role = (typeof ROLES)[number];

export const CAPABILITIES = [
  'user.read',
  'user.manage',
  'customer.read',
  'customer.write',
  'product.read',
  'product.write',
  'master.read',
  'master.write',
  'asset.read',
  'asset.write',
  'asset.cost.read',
  'asset.status',
  'receipt.read',
  'receipt.write',
  'order.read',
  'order.write',
  'order.approve',
  'availability.read',
  'warehouse.read',
  'warehouse.write',
  'handover.sign',
  'incident.read',
  'incident.report',
  'incident.review',
  'service.read',
  'service.write',
  'replacement.receive',
  'finance.read',
  'finance.write',
  'dashboard.read',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  // Owner memiliki otorisasi tertinggi: semua capability (superset Admin).
  OWNER: [...CAPABILITIES],
  ADMIN: [...CAPABILITIES],
  OPS_COORDINATOR: [
    // user.read: koordinator menunjuk PIC internal pada pesanan.
    'user.read',
    'customer.read',
    'product.read',
    'master.read',
    'asset.read',
    'asset.status',
    'receipt.read',
    'order.read',
    'order.write',
    'availability.read',
    'warehouse.read',
    // Review insiden dan tiket servis (TECHNICAL_SPEC §3: koordinator menangani insiden/penggantian).
    'incident.read',
    'incident.report',
    'incident.review',
    'service.read',
    'service.write',
    // Koordinator memantau kesehatan aset dan pergerakan barang (tanpa data keuangan).
    'dashboard.read',
  ],
  WAREHOUSE: [
    'product.read',
    'master.read',
    'asset.read',
    'asset.status',
    'receipt.read',
    'receipt.write',
    'order.read',
    'availability.read',
    'warehouse.read',
    'warehouse.write',
    'handover.sign',
    // Gudang membuat/memperbarui tiket servis; aset pengganti di-scan lewat warehouse.write.
    'service.read',
    'service.write',
  ],
  // PIC lapangan: lapor insiden, lihat laporannya sendiri, dan terima aset pengganti.
  FIELD_PIC: ['incident.read', 'incident.report', 'replacement.receive'],
  CUSTOMER: [],
};

export function hasCapability(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

/** Email akun contoh per role (hanya untuk seed dev dan halaman login dev; password dari env). */
export function demoAccountEmail(role: Role): string {
  return `${role.toLowerCase().replace(/_/g, '-')}@eventra.test`;
}
