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
      { id: 'a', price: 100_000, deposit: 50_000 },
      { id: 'b', price: 10_000, deposit: 0 },
    ];
    expect(cartTotals(products, { a: 2, b: 1 }, '2026-12-03', '2026-12-05')).toEqual({
      days: 3,
      units: 3,
      subtotal: 2 * 100_000 * 3 + 10_000 * 3,
      deposit: 100_000,
    });
  });
});
