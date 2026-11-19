import { MAX_ITEM_QUANTITY, type ItemAvailabilityDto } from '@eventra/shared';
import type { Cart } from './pos';

/** Stok satu produk pada tanggal sewa: sisa fisik tiap komponen (paket = beberapa komponen). */
export interface StockEntry {
  components: { productId: string; perUnit: number; remaining: number; unlimited: boolean }[];
}
export type StockMap = Record<string, StockEntry>;

/** Dari hasil cek ketersediaan satu produk (kuantitas 1, mode independen). */
export function stockEntry(item: ItemAvailabilityDto): StockEntry {
  return {
    components: item.components.map((c) => ({
      productId: c.productId,
      perUnit: c.required, // kuantitas 1 → kebutuhan per unit
      remaining: c.minRemaining,
      unlimited: c.unlimited,
    })),
  };
}

/** Pemakaian stok fisik oleh isi keranjang (paket memakai komponennya). */
export function physicalUsed(stock: StockMap, cart: Cart): Map<string, number> {
  const used = new Map<string, number>();
  for (const [productId, qty] of Object.entries(cart)) {
    if (qty <= 0) continue;
    for (const c of stock[productId]?.components ?? []) {
      used.set(c.productId, (used.get(c.productId) ?? 0) + qty * c.perUnit);
    }
  }
  return used;
}

/**
 * Sisa unit yang masih bisa ditambahkan setelah isi keranjang. Dapat negatif bila keranjang sudah
 * melebihi stok bersama (mis. kabinet dipakai langsung dan oleh paket). Tanpa komponen terbatas
 * (stok tak terbatas) hasilnya `MAX_ITEM_QUANTITY`.
 */
export function unitsLeft(entry: StockEntry, used: Map<string, number>): number {
  let left = MAX_ITEM_QUANTITY;
  for (const c of entry.components) {
    if (c.unlimited || c.perUnit <= 0) continue;
    left = Math.min(left, Math.floor((c.remaining - (used.get(c.productId) ?? 0)) / c.perUnit));
  }
  return left;
}
