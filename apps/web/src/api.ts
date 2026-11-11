import { createApiClient } from '@eventra/api-client';
import { i18n } from './i18n';
import { notifyError } from './lib/notifications';

/** Client Axios bersama untuk seluruh web. Setiap error otomatis tampil sebagai notifikasi. */
export const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1',
  onError: (error) => {
    // Terjemahan lokal diutamakan; pesan server dipakai bila kode belum diterjemahkan.
    notifyError(i18n.t(`errors.${error.code}`, { defaultValue: error.message }));
  },
});
