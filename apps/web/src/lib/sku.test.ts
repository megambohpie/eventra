import { describe, expect, it } from 'vitest';
import { suggestSku } from './sku';

describe('suggestSku', () => {
  it('menyusun kategori-nama-angka', () => {
    expect(suggestSku('Sound System', 'Speaker Aktif 12"', '482')).toBe('SOU-SPEAKE-482');
  });
  it('mengabaikan aksen/simbol dan kategori kosong', () => {
    expect(suggestSku('', 'Kursí Tamu', '100')).toBe('KURSIT-100');
  });
  it('kosong bila nama kosong', () => {
    expect(suggestSku('Tenda', '  ', '100')).toBe('');
  });
});
