import { describe, expect, it } from 'vitest';
import {
  computeInvoiceBalance,
  computeLateFee,
  paymentCreateSchema,
  revenueQuerySchema,
} from './finance';

const base = {
  rentAmount: 1_000_000,
  depositAmount: 200_000,
  paidRent: 0,
  paidDeposit: 0,
  pendingRent: 0,
  pendingDeposit: 0,
  dueDate: '2027-06-10',
  today: '2027-06-01',
  voided: false,
};

describe('computeInvoiceBalance', () => {
  it('belum dibayar, sebagian, lunas', () => {
    expect(computeInvoiceBalance(base)).toMatchObject({
      paymentState: 'UNPAID',
      outstanding: 1_200_000,
    });
    expect(computeInvoiceBalance({ ...base, paidRent: 400_000 })).toMatchObject({
      paymentState: 'PARTIAL',
      outstandingRent: 600_000,
      outstanding: 800_000,
    });
    expect(
      computeInvoiceBalance({ ...base, paidRent: 1_000_000, paidDeposit: 200_000 }),
    ).toMatchObject({ paymentState: 'PAID', outstanding: 0 });
  });

  it('terlambat hanya bila lewat jatuh tempo dan masih ada sisa', () => {
    const late = computeInvoiceBalance({ ...base, today: '2027-06-13' });
    expect(late).toMatchObject({ paymentState: 'OVERDUE', overdueDays: 3 });
    expect(computeInvoiceBalance({ ...base, today: '2027-06-10' }).paymentState).toBe('UNPAID');
    const paid = computeInvoiceBalance({
      ...base,
      today: '2027-06-13',
      paidRent: 1_000_000,
      paidDeposit: 200_000,
    });
    expect(paid).toMatchObject({ paymentState: 'PAID', overdueDays: 0 });
  });

  it('pembayaran pending tidak mengurangi piutang tetapi menahan batas bayar', () => {
    const b = computeInvoiceBalance({ ...base, pendingRent: 300_000 });
    expect(b.outstanding).toBe(1_200_000);
    expect(b.payableRent).toBe(700_000);
    expect(b.pending).toBe(300_000);
  });

  it('invoice void tidak punya piutang', () => {
    expect(computeInvoiceBalance({ ...base, voided: true })).toMatchObject({
      paymentState: 'VOID',
      outstanding: 0,
      payableRent: 0,
    });
  });
});

describe('skema keuangan', () => {
  it('transfer/gateway wajib referensi; nominal harus bulat positif', () => {
    const ok = { purpose: 'RENT', method: 'CASH', amount: 1000 };
    expect(paymentCreateSchema.safeParse(ok).success).toBe(true);
    expect(paymentCreateSchema.safeParse({ ...ok, method: 'BANK_TRANSFER' }).success).toBe(false);
    expect(
      paymentCreateSchema.safeParse({ ...ok, method: 'GATEWAY', reference: 'GW-1' }).success,
    ).toBe(true);
    expect(paymentCreateSchema.safeParse({ ...ok, amount: 0 }).success).toBe(false);
    expect(paymentCreateSchema.safeParse({ ...ok, amount: 10.5 }).success).toBe(false);
  });

  it('rentang laporan valid dan dibatasi', () => {
    expect(revenueQuerySchema.safeParse({ from: '2027-01-01', to: '2027-01-31' }).success).toBe(
      true,
    );
    expect(revenueQuerySchema.safeParse({ from: '2027-02-01', to: '2027-01-31' }).success).toBe(
      false,
    );
    expect(revenueQuerySchema.safeParse({ from: '2000-01-01', to: '2027-01-31' }).success).toBe(
      false,
    );
  });
});

describe('computeLateFee', () => {
  const late = {
    endDate: '2027-06-10',
    returnedOn: '2027-06-10',
    rentAmount: 1_000_000,
    percentPerDay: 10,
    graceDays: 0,
  };
  it('tepat waktu atau lebih awal = 0', () => {
    expect(computeLateFee(late).amount).toBe(0);
    expect(computeLateFee({ ...late, returnedOn: '2027-06-08' })).toMatchObject({
      daysLate: 0,
      amount: 0,
    });
  });
  it('persen × sewa × hari terlambat', () => {
    expect(computeLateFee({ ...late, returnedOn: '2027-06-13' })).toEqual({
      daysLate: 3,
      chargeableDays: 3,
      amount: 300_000,
    });
  });
  it('toleransi mengurangi hari yang dikenai denda', () => {
    expect(computeLateFee({ ...late, returnedOn: '2027-06-13', graceDays: 1 })).toEqual({
      daysLate: 3,
      chargeableDays: 2,
      amount: 200_000,
    });
    expect(computeLateFee({ ...late, returnedOn: '2027-06-11', graceDays: 1 }).amount).toBe(0);
  });
  it('dibulatkan ke atas ke rupiah bulat', () => {
    expect(
      computeLateFee({ ...late, rentAmount: 333_333, percentPerDay: 7.5, returnedOn: '2027-06-11' })
        .amount,
    ).toBe(25_000);
  });
});
