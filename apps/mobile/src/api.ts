import { createApiClient, refreshSession } from '@eventra/api-client';
import { errorMessage } from './lib/errors';
import { createSessionStore } from './lib/session';
import { notifyError } from './lib/toast';
import { secureStorage } from './storage';

export const sessionStore = createSessionStore(secureStorage);

/** Client Axios bersama (paket yang sama dengan web). Error API otomatis menjadi toast. */
export const api = createApiClient({
  baseURL: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1',
  getAccessToken: () => sessionStore.get().accessToken,
  // Access token kadaluarsa: tukar refresh token (dirotasi), lalu request diulang otomatis.
  refreshSession: async () => {
    const { refreshToken } = sessionStore.get();
    if (!refreshToken) return null;
    try {
      const session = await refreshSession(api, refreshToken);
      await sessionStore.set(session);
      return session.accessToken;
    } catch {
      return null;
    }
  },
  // Sesi tak bisa dipulihkan: hapus; App kembali ke layar login.
  onUnauthorized: () => void sessionStore.clear(),
  onError: (error) => {
    // Sesi berakhir sudah ditangani dengan kembali ke login; jangan menambah toast di atasnya.
    if (error.code === 'UNAUTHENTICATED' || error.code === 'INVALID_REFRESH_TOKEN') return;
    notifyError(errorMessage(error));
  },
});
