import { describe, expect, it } from 'vitest';
import {
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  canTransitionOrder,
  eachDate,
  orderInputSchema,
  picInputSchema,
  rentalDays,
} from './orders';
import { hasCapability } from './rbac';

const uuid = '00000000-0000-4000-8000-000000000001';
const order = {
  customerId: uuid,
  startDate: '2026-12-01',
  endDate: '2026-12-02',
  eventLocation: 'Balai',
  items: [{ productId: uuid, quantity: 2 }],
};

describe('tanggal sewa', () => {
  it('menghitung hari inklusif dan mendaftar tanggal', () => {
    expect(rentalDays('2026-12-01', '2026-12-01')).toBe(1);
    expect(rentalDays('2026-12-08', '2026-12-09')).toBe(2);
    expect(eachDate('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });
});

describe('state machine pesanan', () => {
  it('jalur utama valid dan status terminal tidak punya transisi keluar', () => {
    expect(canTransitionOrder('DRAFT', 'PENDING_REVIEW')).toBe(true);
    expect(canTransitionOrder('QUOTED', 'AWAITING_PAYMENT')).toBe(true);
    expect(canTransitionOrder('AWAITING_PAYMENT', 'CONFIRMED')).toBe(true);
    expect(canTransitionOrder('DRAFT', 'CONFIRMED')).toBe(false);
    for (const s of ['COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED'] as const) {
      expect(ORDER_TRANSITIONS[s]).toEqual([]);
    }
    expect(Object.keys(ORDER_TRANSITIONS).sort()).toEqual([...ORDER_STATUSES].sort());
  });
});

describe('skema pesanan', () => {
  it('menolak rentang tanggal terbalik, terlalu panjang, dan produk duplikat', () => {
    expect(orderInputSchema.safeParse(order).success).toBe(true);
    expect(orderInputSchema.safeParse({ ...order, endDate: '2026-11-30' }).success).toBe(false);
    expect(orderInputSchema.safeParse({ ...order, endDate: '2027-12-31' }).success).toBe(false);
    expect(
      orderInputSchema.safeParse({ ...order, items: [...order.items, ...order.items] }).success,
    ).toBe(false);
  });
});

describe('skema PIC', () => {
  it('PIC pemilik butuh pengguna, eksternal butuh nama+telepon, pihak ketiga butuh otorisasi', () => {
    expect(picInputSchema.safeParse({ role: 'FIELD', source: 'OWNER', userId: uuid }).success).toBe(
      true,
    );
    expect(picInputSchema.safeParse({ role: 'FIELD', source: 'OWNER' }).success).toBe(false);
    expect(
      picInputSchema.safeParse({
        role: 'CUSTOMER_PIC',
        source: 'CUSTOMER',
        name: 'A',
        phone: '0811',
      }).success,
    ).toBe(true);
    expect(picInputSchema.safeParse({ role: 'CUSTOMER_PIC', source: 'CUSTOMER' }).success).toBe(
      false,
    );
    const third = {
      role: 'FIELD',
      source: 'THIRD_PARTY',
      name: 'V',
      phone: '0811',
      organization: 'CV',
    };
    expect(picInputSchema.safeParse(third).success).toBe(false);
    expect(picInputSchema.safeParse({ ...third, authorization: 'Surat' }).success).toBe(true);
    // PIC gudang wajib internal.
    expect(
      picInputSchema.safeParse({
        role: 'WAREHOUSE_OUT',
        source: 'CUSTOMER',
        name: 'A',
        phone: '0811',
      }).success,
    ).toBe(false);
  });
});

describe('capability pesanan', () => {
  it('owner baca saja; koordinator tidak menyetujui; hanya admin yang approve', () => {
    expect(hasCapability('OWNER', 'order.read')).toBe(true);
    expect(hasCapability('OWNER', 'order.write')).toBe(false);
    expect(hasCapability('OPS_COORDINATOR', 'order.write')).toBe(true);
    expect(hasCapability('OPS_COORDINATOR', 'order.approve')).toBe(false);
    expect(hasCapability('WAREHOUSE', 'order.write')).toBe(false);
    expect(hasCapability('ADMIN', 'order.approve')).toBe(true);
    expect(hasCapability('FIELD_PIC', 'order.read')).toBe(false);
  });
});
