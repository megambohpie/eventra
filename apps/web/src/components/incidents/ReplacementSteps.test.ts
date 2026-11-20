import { describe, expect, it } from 'vitest';
import { REPLACEMENT_STEPS, currentStepIndex } from './ReplacementSteps';

describe('langkah penggantian', () => {
  it('status tugas menentukan langkah yang sedang menunggu', () => {
    expect(REPLACEMENT_STEPS).toEqual(['PICK', 'VERIFY', 'DISPATCH', 'RECEIVE']);
    expect(currentStepIndex('PENDING_PICK')).toBe(0);
    expect(currentStepIndex('PICKED')).toBe(1);
    expect(currentStepIndex('VERIFIED')).toBe(2);
    expect(currentStepIndex('DISPATCHED')).toBe(3);
    // Diterima = semua langkah selesai; dibatalkan = tidak ada langkah aktif.
    expect(currentStepIndex('RECEIVED')).toBe(REPLACEMENT_STEPS.length);
    expect(currentStepIndex('CANCELLED')).toBe(-1);
  });
});
