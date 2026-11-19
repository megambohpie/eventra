import { describe, expect, it } from 'vitest';
import type { CalendarOrderDto } from '@eventra/shared';
import { monthRange, monthWeeks, weekBars } from './calendar';

const order = (id: string, startDate: string, endDate: string): CalendarOrderDto => ({
  orderId: id,
  orderNumber: `ORD-${id}`,
  status: 'CONFIRMED',
  customerId: `cust-${id}`,
  customerName: `Cust ${id}`,
  eventLocation: 'Lokasi',
  startDate,
  endDate,
  assetCount: 0,
  lines: [],
});

describe('kalender', () => {
  it('monthRange menghitung hari terakhir', () => {
    expect(monthRange(2026, 1)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange(2028, 1).to).toBe('2028-02-29');
  });

  it('monthWeeks: Senin pertama, sel kosong diisi null', () => {
    // 1 Des 2026 = Selasa.
    const weeks = monthWeeks(2026, 11);
    expect(weeks[0]?.[0]).toBeNull();
    expect(weeks[0]?.[1]).toBe('2026-12-01');
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
  });

  it('weekBars: pesanan multi-hari menjadi satu blok panjang', () => {
    const weeks = monthWeeks(2026, 11);
    const bars = weekBars(weeks[0] as string[], [order('a', '2026-12-02', '2026-12-04')]);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({
      col: 3,
      span: 3,
      continuesBefore: false,
      continuesAfter: false,
    });
  });

  it('weekBars: pesanan melewati batas minggu dipotong dan ditandai berlanjut', () => {
    const weeks = monthWeeks(2026, 11);
    const o = order('b', '2026-12-04', '2026-12-09');
    const first = weekBars(weeks[0] as string[], [o])[0];
    const second = weekBars(weeks[1] as string[], [o])[0];
    expect(first).toMatchObject({ col: 5, span: 3, continuesAfter: true, continuesBefore: false });
    expect(second).toMatchObject({ col: 1, span: 3, continuesBefore: true, continuesAfter: false });
    expect(weekBars(weeks[2] as string[], [o])).toHaveLength(0);
  });

  it('weekBars: satu hari = blok selebar satu kolom', () => {
    const weeks = monthWeeks(2026, 11);
    const bars = weekBars(weeks[1] as string[], [order('c', '2026-12-08', '2026-12-08')]);
    expect(bars[0]).toMatchObject({ col: 2, span: 1 });
  });
});

describe('warna pelanggan', () => {
  it('setiap pelanggan berbeda hue-nya; pelanggan yang sama selalu sama', async () => {
    const { customerTones } = await import('./calendar');
    const o = (id: string, cust: string, start: string): CalendarOrderDto => ({
      ...order(id, start, start),
      customerId: cust,
      customerName: cust,
    });
    const tones = customerTones([
      o('b', 'hartono', '2026-11-20'),
      o('a', 'sartono', '2026-11-16'),
      o('c', 'hartono', '2026-11-25'),
      o('d', 'budi', '2026-11-26'),
    ]);
    expect(tones.size).toBe(3);
    const hues = [...tones.values()].map((t) => t.hue);
    expect(new Set(hues).size).toBe(3);
    // Urutan menurut pesanan pertama: sartono (16), hartono (20), budi (26).
    expect(tones.get('sartono')?.hue).toBe(0);
    expect(tones.get('hartono')?.hue).toBe(138);
  });
});
