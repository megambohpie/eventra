import { createApiClient, refreshSession } from '@eventra/api-client';
import { i18n } from './i18n';
import { notifyError } from './lib/notifications';
import { clearSession, getSession, setSession } from './lib/session';

/** Client Axios bersama untuk seluruh web. Setiap error otomatis tampil sebagai notifikasi. */
export const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1',
  getAccessToken: () => getSession().accessToken,
  // Access token kadaluarsa: tukar refresh token (dirotasi), lalu request diulang otomatis.
  refreshSession: async () => {
    const { refreshToken } = getSession();
    if (!refreshToken) return null;
    try {
      const session = await refreshSession(api, refreshToken);
      setSession(session);
      return session.accessToken;
    } catch {
      return null;
    }
  },
  // Sesi tak bisa dipulihkan: hapus; route guard mengarahkan ke /login.
  onUnauthorized: clearSession,
  onError: (error) => {
    // Terjemahan lokal diutamakan; pesan server dipakai bila kode belum diterjemahkan.
    notifyError(i18n.t(`errors.${error.code}`, { defaultValue: error.message }));
  },
});
