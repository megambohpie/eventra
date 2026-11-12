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
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const READ_ALL: Capability[] = [
  'user.read',
  'customer.read',
  'product.read',
  'master.read',
  'asset.read',
  'asset.cost.read',
  'receipt.read',
  'order.read',
  'availability.read',
];

export const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  OWNER: READ_ALL,
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
  ],
  FIELD_PIC: [],
  CUSTOMER: [],
};

export function hasCapability(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}
