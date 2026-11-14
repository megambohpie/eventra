import { describe, expect, it } from 'vitest';
import { buildLabelsPdf, formatPrintedAt, labelsFilename } from './assets/labels';

// 14 Nov 2026 02:15:03 UTC = 09:15:03 WIB
const at = new Date('2026-11-14T02:15:03Z');

describe('label QR: tanggal cetak dan nama berkas', () => {
  it('tanggal cetak dalam WIB', () => {
    expect(formatPrintedAt(at)).toBe('14/11/2026 09:15');
  });
  it('nama berkas memuat tanggal dan jam sehingga unik per cetak', () => {
    expect(labelsFilename(at)).toBe('eventra-qr-labels-20261114-091503.pdf');
    expect(labelsFilename(new Date(at.getTime() + 1000))).not.toBe(labelsFilename(at));
  });
  it('PDF tetap dibuat dengan tanggal cetak', async () => {
    const pdf = await buildLabelsPdf(
      [
        {
          code: 'AST-000001',
          qrToken: 'abcdefghijklmnopqrstuvwx',
          productName: 'LED',
          serial: null,
        },
      ],
      at,
    );
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
