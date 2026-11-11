/** Status aset (TECHNICAL_SPEC §5) dengan varian badge DaisyUI, didefinisikan satu kali. */
export const ASSET_STATUSES = [
  'AVAILABLE',
  'RESERVED',
  'PREPARED',
  'CHECKED_OUT',
  'IN_TRANSIT',
  'ON_SITE',
  'RETURN_PENDING',
  'IN_SERVICE',
  'QUARANTINED',
  'RETIRED',
  'ISSUE_ON_SITE',
] as const;

export type AssetStatus = (typeof ASSET_STATUSES)[number];

export type BadgeVariant = 'success' | 'info' | 'warning' | 'error' | 'neutral' | 'primary';

export const ASSET_STATUS_BADGE: Record<AssetStatus, BadgeVariant> = {
  AVAILABLE: 'success',
  RESERVED: 'info',
  PREPARED: 'info',
  CHECKED_OUT: 'primary',
  IN_TRANSIT: 'primary',
  ON_SITE: 'primary',
  RETURN_PENDING: 'warning',
  IN_SERVICE: 'warning',
  QUARANTINED: 'error',
  RETIRED: 'neutral',
  ISSUE_ON_SITE: 'error',
};
