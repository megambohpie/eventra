import { describe, expect, it } from 'vitest';
import { cartTotals, clampQty, setCartQty } from './pos';

describe('pos', () => {
  it('clampQty: ketikan dibersihkan dan dibatasi stok', () => {
    expect(clampQty('12')).toBe(12);
    expect(clampQty('abc')).toBe(0);
    expect(clampQty('-3')).toBe(3);
    expect(clampQty('50', 15)).toBe(15);
    expect(clampQty(7, 0)).toBe(0);
    expect(clampQty('')).toBe(0);
  });

  it('setCartQty: 0 menghapus produk dari keranjang tanpa mengubah keranjang asal', () => {
    const cart = { a: 2 };
    expect(setCartQty(cart, 'b', 3)).toEqual({ a: 2, b: 3 });
    expect(setCartQty(cart, 'a', 0)).toEqual({});
    expect(cart).toEqual({ a: 2 });
  });

  it('cartTotals: sewa × hari, deposit tidak dikali hari', () => {
    const products = [
      { id: 'a', unitPrice: 100_000, deposit: 50_000, widthCm: null, heightCm: null },
      { id: 'b', unitPrice: 10_000, deposit: 0, widthCm: null, heightCm: null },
    ];
    expect(cartTotals(products, { a: 2, b: 1 }, '2026-12-03', '2026-12-05')).toEqual({
      days: 3,
      units: 3,
      subtotal: 2 * 100_000 * 3 + 10_000 * 3,
      deposit: 100_000,
      areaM2: 0,
    });
  });

  it('cartTotals: kabinet campuran ditagih per luas dan total m² dijumlahkan', () => {
    // Tarif 500.000/m²: 100×50 = 250.000, 50×50 = 125.000 per kabinet per hari; aksesori Rp 0.
    const products = [
      { id: 'big', unitPrice: 250_000, deposit: 0, widthCm: 100, heightCm: 50 },
      { id: 'small', unitPrice: 125_000, deposit: 0, widthCm: 50, heightCm: 50 },
      { id: 'cable', unitPrice: 0, deposit: 0, widthCm: null, heightCm: null },
    ];
    const totals = cartTotals(
      products,
      { big: 8, small: 4, cable: 30 },
      '2026-12-03',
      '2026-12-04',
    );
    // 8 × 0,5 + 4 × 0,25 = 5 m²; 5 m² × 500.000 × 2 hari = 5.000.000
    expect(totals).toMatchObject({ areaM2: 5, subtotal: 5_000_000, units: 42 });
  });
});
