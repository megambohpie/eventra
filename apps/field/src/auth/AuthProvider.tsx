import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  login as loginRequest,
  logout as logoutRequest,
  refreshSession,
} from '@eventra/api-client';
import { hasCapability, type Capability, type LoginInput, type UserDto } from '@eventra/shared';
import { api } from '@/api';
import { clearSession, getSession, setSession, subscribeSession } from '@/lib/session';

export interface AuthContextValue {
  /** `loading` selama sesi tersimpan dipulihkan saat aplikasi dibuka. */
  status: 'loading' | 'authenticated' | 'anonymous';
  user: UserDto | null;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  /** Capability guard untuk aksi di UI; API tetap menjadi penegak utama. */
  can: (capability: Capability) => boolean;
}

const ANONYMOUS: AuthContextValue = {
  status: 'anonymous',
  user: null,
  login: async () => undefined,
  logout: async () => undefined,
  can: () => false,
};

const AuthContext = createContext<AuthContextValue>(ANONYMOUS);

export const useAuth = (): AuthContextValue => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(subscribeSession, getSession, getSession);
  // Ada refresh token tersimpan tetapi access token belum ada: pulihkan sesi dulu.
  const needsRestore = session.user !== null && session.accessToken === null;
  const [restoring, setRestoring] = useState(needsRestore);

  useEffect(() => {
    const { refreshToken } = getSession();
    if (!needsRestore || !refreshToken) return;
    let cancelled = false;
    refreshSession(api, refreshToken)
      .then((fresh) => {
        if (!cancelled) setSession(fresh);
      })
      .catch(() => {
        if (!cancelled) clearSession();
      })
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });
    return () => {
      cancelled = true;
    };
    // Hanya saat mount: pemulihan sesi dijalankan sekali.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    setSession(await loginRequest(api, input));
  }, []);

  const logout = useCallback(async () => {
    const { refreshToken } = getSession();
    try {
      if (refreshToken) await logoutRequest(api, refreshToken);
    } catch {
      /* sesi lokal tetap dihapus; error sudah dinotifikasi oleh client */
    }
    clearSession();
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const user = session.user;
    const status = restoring
      ? 'loading'
      : user && session.accessToken
        ? 'authenticated'
        : 'anonymous';
    return {
      status,
      user: status === 'authenticated' ? user : null,
      login,
      logout,
      can: (capability) =>
        status === 'authenticated' && user !== null && hasCapability(user.role, capability),
    };
  }, [session, restoring, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
