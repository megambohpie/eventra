import type { en } from './en';

type Messages<T> = { [K in keyof T]: T[K] extends string ? string : Messages<T[K]> };

export const id: Messages<typeof en> = {
  app: { name: 'Eventra' },
  nav: { home: 'Beranda' },
  common: {
    theme: { light: 'Ganti ke mode gelap', dark: 'Ganti ke mode terang' },
    language: 'Bahasa',
    close: 'Tutup',
    loading: 'Memuat',
  },
  home: {
    title: 'Kontrol aset rental',
    statusIntro: 'Status koneksi API dan database:',
    api: 'API',
    db: 'DB',
    recheck: 'Cek ulang',
  },
  errors: {
    generic: 'Terjadi kesalahan',
    NETWORK_ERROR: 'Tidak dapat menghubungi server',
    INTERNAL_ERROR: 'Terjadi kesalahan server. Coba lagi nanti',
    VALIDATION_ERROR: 'Permintaan tidak valid',
    UNAUTHENTICATED: 'Silakan masuk kembali',
  },
};
