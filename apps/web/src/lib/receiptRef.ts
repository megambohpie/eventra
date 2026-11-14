import type { ReceiptSource } from '@eventra/shared';

/** Usulan referensi dokumen penerimaan: sumber-tanggal-angka (mis. TRF-20261113-482). */
export function suggestSourceRef(source: ReceiptSource, date: string, suffix: string): string {
  const day = date.replace(/-/g, '');
  return [source.slice(0, 3), day, suffix].filter(Boolean).join('-');
}
