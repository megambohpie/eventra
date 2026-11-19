import { describe, expect, it } from 'vitest';
import { MAX_ITEM_QUANTITY } from '@eventra/shared';
import { physicalUsed, unitsLeft, type StockMap } from './stock';

const comp = (productId: string, perUnit: number, remaining: number, unlimited = false) => ({
  productId,
  perUnit,
  remaining,
  unlimited,
});

// Kabinet (90) dan paket yang memuat 2 kabinet per unit, serta kabel tak terbatas.
const stock: StockMap = {
  cabinet: { components: [comp('cabinet', 1, 90)] },
  pack: { components: [comp('cabinet', 2, 90), comp('cable', 1, 0, true)] },
  cable: { components: [comp('cable', 1, 0, true)] },
};

describe('stok POS mengikuti isi keranjang', () => {
  it('menambah jumlah mengurangi sisa; menguranginya mengembalikan stok', () => {
    const left = (cart: Record<string, number>, id = 'cabinet') =>
      unitsLeft(stock[id]!, physicalUsed(stock, cart));
    expect(left({})).toBe(90);
    expect(left({ cabinet: 10 })).toBe(80);
    expect(left({ cabinet: 4 })).toBe(86); // dikurangi → stok kembali
    expect(left({})).toBe(90);
  });

  it('paket memakai stok komponen yang sama dengan produk komponennya', () => {
    const cart = { pack: 3 }; // 3 × 2 = 6 kabinet
    expect(unitsLeft(stock.cabinet!, physicalUsed(stock, cart))).toBe(84);
    expect(unitsLeft(stock.pack!, physicalUsed(stock, cart))).toBe(42); // (90 − 6) / 2
    const mixed = { pack: 3, cabinet: 4 };
    expect(unitsLeft(stock.pack!, physicalUsed(stock, mixed))).toBe(40); // (90 − 10) / 2
  });

  it('sisa negatif bila keranjang melebihi stok bersama; stok tak terbatas tidak pernah habis', () => {
    expect(unitsLeft(stock.cabinet!, physicalUsed(stock, { pack: 50 }))).toBe(-10);
    expect(unitsLeft(stock.cable!, physicalUsed(stock, { cable: 999 }))).toBe(MAX_ITEM_QUANTITY);
  });
});
