import type { BadgeVariant } from '@eventra/shared';

/** Token UI native; nilai disalin dari assets/brand/eventra-theme.css (tema eventra-light). */
export const colors = {
  base100: '#FFFFFF',
  base200: '#F5F9FF',
  base300: '#D9E8FC',
  baseContent: '#172554',
  /** Teks sekunder (baseContent dengan opasitas ±70%). */
  muted: '#4B5B85',
  primary: '#2563EB',
  primaryContent: '#FFFFFF',
  neutral: '#123B6D',
  info: '#0284C7',
  success: '#16A34A',
  warning: '#D97706',
  error: '#DC2626',
} as const;

export const radius = { box: 12, field: 8 } as const;
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24 } as const;

/** Target sentuh minimum (pedoman platform ±44–48 dp). */
export const touch = { minHeight: 48 } as const;

export const badgeColors: Record<BadgeVariant, string> = {
  success: colors.success,
  info: colors.info,
  warning: colors.warning,
  error: colors.error,
  neutral: colors.muted,
  primary: colors.primary,
};
