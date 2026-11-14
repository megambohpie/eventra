import { describe, expect, it } from 'vitest';
import { suggestSourceRef } from './receiptRef';

describe('suggestSourceRef', () => {
  it('menyusun sumber-tanggal-angka', () => {
    expect(suggestSourceRef('TRANSFER', '2026-11-13', '482')).toBe('TRA-20261113-482');
    expect(suggestSourceRef('PURCHASE', '2026-11-13', '100')).toBe('PUR-20261113-100');
  });
});
