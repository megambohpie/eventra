import { describe, expect, it } from 'vitest';
import { normalizePhone, portalLoginSchema } from './portal';

describe('portal pelanggan', () => {
  it('normalisasi nomor HP: format berbeda dianggap sama', () => {
    const expected = '6281234567890';
    for (const v of ['081234567890', '+62 812-3456-7890', '6281234567890', '812 3456 7890']) {
      expect(normalizePhone(v)).toBe(expected);
    }
    expect(normalizePhone('0812')).not.toBe(expected);
  });

  it('login: nomor pesanan di-trim dan dijadikan huruf besar; isian kosong ditolak', () => {
    const ok = portalLoginSchema.parse({
      phone: '0812 3456 7890',
      orderNumber: ' ord-2027-000123 ',
    });
    expect(ok.orderNumber).toBe('ORD-2027-000123');
    expect(portalLoginSchema.safeParse({ phone: '', orderNumber: 'ORD-1' }).success).toBe(false);
    expect(portalLoginSchema.safeParse({ phone: '0812345678', orderNumber: '' }).success).toBe(
      false,
    );
    expect(
      portalLoginSchema.safeParse({ phone: 'abc12345678', orderNumber: 'ORD-1' }).success,
    ).toBe(false);
  });
});
