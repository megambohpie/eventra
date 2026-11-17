import { ApiRequestError } from '@eventra/api-client';

/** Pesan server sudah berbahasa Indonesia; hanya kode umum yang diganti agar lebih jelas di ponsel. */
const MESSAGES: Record<string, string> = {
  NETWORK_ERROR: 'Tidak dapat menjangkau server. Periksa koneksi internet Anda.',
  UNAUTHENTICATED: 'Sesi berakhir. Silakan masuk kembali.',
  INVALID_REFRESH_TOKEN: 'Sesi berakhir. Silakan masuk kembali.',
  INVALID_CREDENTIALS: 'Email atau kata sandi salah.',
  FORBIDDEN: 'Anda tidak memiliki izin untuk aksi ini.',
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return MESSAGES[error.code] ?? error.message;
  if (error instanceof Error) return error.message;
  return 'Terjadi kesalahan tak terduga.';
}

/** Error jaringan: aksi tulis tidak boleh diulang otomatis (scan harus tervalidasi server). */
export const isNetworkError = (error: unknown): boolean =>
  error instanceof ApiRequestError && error.code === 'NETWORK_ERROR';
