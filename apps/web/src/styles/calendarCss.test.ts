import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('CSS kalender pesanan', () => {
  it('aturan lebar (col-span) ditulis sebelum aturan kolom (col-start)', () => {
    // col-span-* adalah shorthand `grid-column` yang mereset col-start-*; bila ditulis sesudahnya,
    // semua blok pesanan tergambar di kolom yang salah (mis. pesanan tgl 20–21 muncul di 17–18).
    const css = readFileSync(new URL('./pages.css', import.meta.url), 'utf8');
    const span = css.indexOf(".ev-calendar__bar[data-span='1']");
    const col = css.indexOf(".ev-calendar__bar[data-col='1']");
    expect(span).toBeGreaterThan(-1);
    expect(col).toBeGreaterThan(-1);
    expect(span).toBeLessThan(col);
  });
});
