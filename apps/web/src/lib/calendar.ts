import type { CalendarOrderDto } from '@eventra/shared';

const pad = (n: number) => String(n).padStart(2, '0');
const key = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;

/** Rentang tanggal penuh satu bulan (`month` berbasis 0). */
export function monthRange(year: number, month: number) {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return { from: key(year, month, 1), to: key(year, month, last) };
}

/** Pecah bulan menjadi minggu (Senin = kolom pertama); sel di luar bulan bernilai `null`. */
export function monthWeeks(year: number, month: number): (string | null)[][] {
  const { to } = monthRange(year, month);
  const total = Number(to.slice(8));
  const lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => key(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export interface WeekBar {
  order: CalendarOrderDto;
  /** Kolom awal (1–7) dan lebar (1–7) blok pada minggu ini. */
  col: number;
  span: number;
  /** Pesanan berlanjut dari minggu sebelumnya / ke minggu berikutnya. */
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/**
 * Blok pesanan untuk satu minggu: dipotong pada batas minggu, sehingga satu pesanan
 * multi-hari tampil sebagai blok panjang dari tanggal mulai sampai tanggal selesai.
 */
export function weekBars(week: (string | null)[], orders: CalendarOrderDto[]): WeekBar[] {
  const days = week
    .map((d, i) => ({ d, col: i + 1 }))
    .filter((x): x is { d: string; col: number } => x.d !== null);
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return [];
  const bars: WeekBar[] = [];
  for (const order of orders) {
    if (order.endDate < first.d || order.startDate > last.d) continue;
    const start = days.find((x) => x.d >= order.startDate) ?? first;
    const end = [...days].reverse().find((x) => x.d <= order.endDate) ?? last;
    bars.push({
      order,
      col: start.col,
      span: end.col - start.col + 1,
      continuesBefore: order.startDate < first.d,
      continuesAfter: order.endDate > last.d,
    });
  }
  return bars.sort(
    (a, b) =>
      a.col - b.col || b.span - a.span || a.order.orderNumber.localeCompare(b.order.orderNumber),
  );
}
