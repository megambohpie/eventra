import { rentalDays } from '@eventra/shared';

/** Keranjang POS: productId → kuantitas (angka positif). */
export type Cart = Record<string, number>;

/** Ubah teks ketikan menjadi kuantitas bulat ≥ 0, dibatasi stok bila stok sudah diketahui. */
export function clampQty(raw: string | number, max?: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw.replace(/\D/g, ''));
  if (!Number.isFinite(n) || n < 0) return 0;
  const whole = Math.floor(n);
  return max === undefined ? whole : Math.min(whole, Math.max(0, max));
}

/** Set kuantitas satu produk; 0 menghapusnya dari keranjang. */
export function setCartQty(cart: Cart, productId: string, qty: number): Cart {
  const next = { ...cart };
  if (qty <= 0) delete next[productId];
  else next[productId] = qty;
  return next;
}

interface Priced {
  id: string;
  price: number;
  deposit: number;
}

/** Perkiraan total (harga × qty × hari; deposit tidak dikali hari) — sama dengan aturan backend. */
export function cartTotals(
  products: Priced[],
  cart: Cart,
  startDate: string,
  endDate: string,
): { days: number; units: number; subtotal: number; deposit: number } {
  const days = Math.max(0, rentalDays(startDate, endDate));
  let units = 0;
  let subtotal = 0;
  let deposit = 0;
  for (const p of products) {
    const qty = cart[p.id] ?? 0;
    if (qty <= 0) continue;
    units += qty;
    subtotal += p.price * qty * days;
    deposit += p.deposit * qty;
  }
  return { days, units, subtotal, deposit };
}
