import type { AuthSession, PortalSession, UserDto } from '@eventra/shared';

/**
 * Store sesi global (dapat dibaca interceptor Axios di luar React).
 * Access token hanya di memori; refresh token + profil disimpan agar sesi bertahan setelah reload.
 */
export interface SessionState {
  user: UserDto | null;
  accessToken: string | null;
  refreshToken: string | null;
}

const STORAGE_KEY = 'eventra.session';
const listeners = new Set<() => void>();

function load(): SessionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { user?: UserDto; refreshToken?: string };
      if (parsed.user && parsed.refreshToken) {
        return { user: parsed.user, accessToken: null, refreshToken: parsed.refreshToken };
      }
    }
  } catch {
    /* storage tidak tersedia atau rusak */
  }
  return { user: null, accessToken: null, refreshToken: null };
}

let state: SessionState = load();

function persist(): void {
  try {
    if (state.refreshToken && state.user) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ user: state.user, refreshToken: state.refreshToken }),
      );
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* abaikan */
  }
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

export const getSession = (): SessionState => state;

export function setSession(session: AuthSession): void {
  state = {
    user: session.user,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  };
  persist();
  emit();
}

export function clearSession(): void {
  state = { user: null, accessToken: null, refreshToken: null };
  persist();
  emit();
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Sesi pelanggan (login no HP + no pesanan): satu token = satu pesanan. Disimpan terpisah dari sesi staf
 * agar pelanggan dengan beberapa pesanan cukup keluar lalu masuk dengan pesanan lainnya.
 */
const PORTAL_KEY = 'eventra.portal';

function loadPortal(): PortalSession | null {
  try {
    const raw = localStorage.getItem(PORTAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PortalSession;
    return parsed.accessToken && new Date(parsed.expiresAt).getTime() > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

let portal: PortalSession | null = loadPortal();

/** Sesi pelanggan; otomatis dianggap habis setelah `expiresAt` (pelanggan masuk ulang). */
export const getPortal = (): PortalSession | null =>
  portal && new Date(portal.expiresAt).getTime() > Date.now() ? portal : null;

export function setPortal(session: PortalSession | null): void {
  portal = session;
  try {
    if (session) localStorage.setItem(PORTAL_KEY, JSON.stringify(session));
    else localStorage.removeItem(PORTAL_KEY);
  } catch {
    /* abaikan */
  }
  emit();
}
