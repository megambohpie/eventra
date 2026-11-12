import type { AuthSession, UserDto } from '@eventra/shared';

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type SessionStatus = 'restoring' | 'signedOut' | 'signedIn';

export interface SessionState {
  status: SessionStatus;
  user: UserDto | null;
  /** Hanya di memori. */
  accessToken: string | null;
  refreshToken: string | null;
}

const STORAGE_KEY = 'eventra.session';

const SIGNED_OUT: SessionState = {
  status: 'signedOut',
  user: null,
  accessToken: null,
  refreshToken: null,
};

/**
 * Store sesi global yang juga dibaca interceptor Axios di luar React. Access token hanya di
 * memori; refresh token + profil disimpan di penyimpanan aman perangkat (Keychain/Keystore).
 */
export function createSessionStore(storage: KeyValueStorage) {
  let state: SessionState = { ...SIGNED_OUT, status: 'restoring' };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const swallow = () => undefined;

  const persist = async (next: SessionState) => {
    if (next.user && next.refreshToken) {
      await storage
        .setItem(STORAGE_KEY, JSON.stringify({ user: next.user, refreshToken: next.refreshToken }))
        .catch(swallow);
    } else {
      await storage.removeItem(STORAGE_KEY).catch(swallow);
    }
  };

  return {
    get: (): SessionState => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Pulihkan sesi tersimpan. Tanpa data tersimpan → signedOut. */
    async restore(): Promise<void> {
      let stored: { user?: UserDto; refreshToken?: string } = {};
      try {
        stored = JSON.parse((await storage.getItem(STORAGE_KEY)) ?? '{}') as typeof stored;
      } catch {
        stored = {};
      }
      state =
        stored.user && stored.refreshToken
          ? {
              status: 'signedIn',
              user: stored.user,
              accessToken: null,
              refreshToken: stored.refreshToken,
            }
          : { ...SIGNED_OUT };
      emit();
    },
    async set(session: AuthSession): Promise<void> {
      state = {
        status: 'signedIn',
        user: session.user,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      };
      emit();
      await persist(state);
    },
    async clear(): Promise<void> {
      state = { ...SIGNED_OUT };
      emit();
      await persist(state);
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
