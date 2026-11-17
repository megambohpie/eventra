import { createApiClient, refreshSession } from '@eventra/api-client';
import { errorMessage } from './lib/errors';
import { notifyError } from './lib/notifications';
import { clearSession, getSession, setSession } from './lib/session';

/** Client Axios bersama (paket yang sama dengan web admin). Error API otomatis tampil sebagai notifikasi. */
export const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL ?? `http://${window.location.hostname}:3000/api/v1`,
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
    // Sesi berakhir sudah ditangani dengan kembali ke login; jangan menambah notifikasi di atasnya.
    if (error.code === 'UNAUTHENTICATED' || error.code === 'INVALID_REFRESH_TOKEN') return;
    notifyError(errorMessage(error));
  },
});
