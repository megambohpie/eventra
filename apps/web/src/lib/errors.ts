import type { TFunction } from 'i18next';

/**
 * Teks error yang diterjemahkan. `fields` dari server (mis. nomor pesanan pada `SCAN_ASSET_IN_USE`)
 * menjadi parameter terjemahan; pesan server dipakai bila kode belum diterjemahkan.
 */
export function errorText(
  t: TFunction,
  error: { code: string; message: string; fields?: Record<string, string[]> },
): string {
  const params = Object.fromEntries(
    Object.entries(error.fields ?? {}).map(([key, values]) => [key, values[0] ?? '']),
  );
  return t(`errors.${error.code}`, { defaultValue: error.message, ...params });
}

/** Kode penolakan scan yang teksnya memuat rincian (pesanan pemakai aset). */
const DETAILED_SCAN_REASONS = ['SCAN_ASSET_IN_USE', 'SCAN_ASSET_MISSING'];

/**
 * Teks alasan pada log scan. Rincian disimpan server di `note` (JSON `fields`); event lama tanpa
 * rincian memakai teks umum agar tidak menampilkan placeholder kosong.
 */
export function scanReasonText(t: TFunction, reason: string, note: string | null): string {
  let fields: Record<string, string[]> | undefined;
  if (note?.startsWith('{')) {
    try {
      fields = JSON.parse(note) as Record<string, string[]>;
    } catch {
      fields = undefined;
    }
  }
  if (DETAILED_SCAN_REASONS.includes(reason) && !fields?.order) {
    return t('errors.SCAN_ASSET_UNAVAILABLE');
  }
  return errorText(t, { code: reason, message: reason, fields });
}
