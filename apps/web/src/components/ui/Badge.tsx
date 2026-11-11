import type { ReactNode } from 'react';
import type { BadgeVariant } from '@eventra/shared';

// Kelas ditulis utuh agar terdeteksi Tailwind. Satu-satunya pemetaan varian -> kelas badge.
const BADGE_CLASS: Record<BadgeVariant, string> = {
  success: 'badge-success',
  info: 'badge-info',
  warning: 'badge-warning',
  error: 'badge-error',
  neutral: 'badge-neutral',
  primary: 'badge-primary',
};

export function Badge({ variant, children }: { variant: BadgeVariant; children: ReactNode }) {
  return <span className={`badge ${BADGE_CLASS[variant]}`}>{children}</span>;
}
