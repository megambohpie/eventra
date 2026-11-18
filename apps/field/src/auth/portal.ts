import { useSyncExternalStore } from 'react';
import type { PortalSession } from '@eventra/shared';
import { getPortal, setPortal, subscribeSession } from '@/lib/session';

/** Sesi pelanggan aktif (login no HP + no pesanan); null bila belum masuk atau sudah kedaluwarsa. */
export function usePortal(): PortalSession | null {
  return useSyncExternalStore(subscribeSession, getPortal, getPortal);
}

export const portalLogout = (): void => setPortal(null);
