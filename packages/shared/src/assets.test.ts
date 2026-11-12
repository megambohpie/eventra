import { describe, expect, it } from 'vitest';
import {
  MANUAL_STATUS_TRANSITIONS,
  NON_ALLOCATABLE_STATUSES,
  needsAttention,
  receiptInputSchema,
} from './assets';
import { hasCapability } from './rbac';
import { ASSET_STATUSES } from './status';

const uuid = '00000000-0000-4000-8000-000000000001';
const base = {
  source: 'PURCHASE',
  locationId: uuid,
  receivedDate: '2026-11-10',
  items: [{ productId: uuid, quantity: 2 }],
};

describe('aset', () => {
  it('perlu perhatian bila kondisi buruk atau status servis/karantina', () => {
    expect(needsAttention('AVAILABLE', 'GOOD')).toBe(false);
    expect(needsAttention('AVAILABLE', 'DAMAGED')).toBe(true);
    expect(needsAttention('QUARANTINED', 'GOOD')).toBe(true);
    expect(needsAttention('AVAILABLE', 'POOR')).toBe(true);
  });

  it('status tak dapat dialokasikan tidak bisa dicapai ke operasional secara manual', () => {
    for (const status of ASSET_STATUSES) {
      for (const next of MANUAL_STATUS_TRANSITIONS[status]) {
        expect(['RESERVED', 'PREPARED', 'CHECKED_OUT', 'IN_TRANSIT', 'ON_SITE']).not.toContain(
          next,
        );
      }
    }
    expect(MANUAL_STATUS_TRANSITIONS.RETIRED).toEqual([]);
    expect(NON_ALLOCATABLE_STATUSES).toContain('QUARANTINED');
  });

  it('validasi penerimaan', () => {
    expect(receiptInputSchema.safeParse(base).success).toBe(true);
    expect(receiptInputSchema.safeParse({ ...base, items: [] }).success).toBe(false);
    expect(
      receiptInputSchema.safeParse({
        ...base,
        items: [{ productId: uuid, quantity: 1, serials: ['a', 'b'] }],
      }).success,
    ).toBe(false);
    expect(
      receiptInputSchema.safeParse({ ...base, items: [{ productId: uuid, quantity: 1.5 }] })
        .success,
    ).toBe(false);
  });

  it('harga beli hanya untuk owner dan admin', () => {
    expect(hasCapability('OWNER', 'asset.cost.read')).toBe(true);
    expect(hasCapability('ADMIN', 'asset.cost.read')).toBe(true);
    for (const role of ['OPS_COORDINATOR', 'WAREHOUSE', 'FIELD_PIC', 'CUSTOMER'] as const) {
      expect(hasCapability(role, 'asset.cost.read')).toBe(false);
    }
    expect(hasCapability('OWNER', 'asset.write')).toBe(false);
  });
});
