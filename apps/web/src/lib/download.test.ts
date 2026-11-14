import { describe, expect, it } from 'vitest';
import { timestampedFilename } from './download';

describe('timestampedFilename', () => {
  it('menambah tanggal dan jam agar nama berkas tidak sama', () => {
    const d = new Date(2026, 10, 14, 9, 5, 3);
    expect(timestampedFilename('eventra-qr-labels', 'pdf', d)).toBe(
      'eventra-qr-labels-20261114-090503.pdf',
    );
  });
  it('detik berbeda menghasilkan nama berbeda', () => {
    const a = timestampedFilename('x', 'pdf', new Date(2026, 0, 1, 0, 0, 0));
    const b = timestampedFilename('x', 'pdf', new Date(2026, 0, 1, 0, 0, 1));
    expect(a).not.toBe(b);
  });
});
