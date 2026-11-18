import { describe, expect, it } from 'vitest';
import { createScanGate, parseAssetCode, parseQrToken } from './qr';

describe('parseQrToken', () => {
  it('menerima token aman dan menolak teks lain', () => {
    expect(parseQrToken('  abcDEF1234567890_-xyz ')).toBe('abcDEF1234567890_-xyz');
    expect(parseQrToken('pendek')).toBeNull();
    expect(parseQrToken('https://contoh.com/rahasia?x=1')).toBeNull();
  });
});

describe('parseAssetCode', () => {
  it('mengubah ke huruf besar dan menolak karakter tak valid', () => {
    expect(parseAssetCode(' ast-000123 ')).toBe('AST-000123');
    expect(parseAssetCode('a b')).toBeNull();
  });
});

describe('createScanGate', () => {
  it('menahan QR yang sama selama cooldown', () => {
    let now = 0;
    const gate = createScanGate(2000, () => now);
    expect(gate('A')).toBe(true);
    now = 500;
    expect(gate('A')).toBe(false);
    expect(gate('B')).toBe(true);
    now = 3000;
    expect(gate('B')).toBe(true);
  });
});
