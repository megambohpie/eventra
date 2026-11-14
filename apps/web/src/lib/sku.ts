const letters = (text: string, max: number): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, max);

/**
 * Usulan SKU: awalan kategori + nama produk + angka acak (mengurangi tabrakan).
 * Nama kosong tetap menghasilkan usulan (kategori + angka); kosong hanya bila keduanya kosong.
 */
export function suggestSku(categoryName: string, productName: string, suffix: string): string {
  const name = letters(productName, 6);
  const category = letters(categoryName, 3);
  if (!name && !category) return '';
  return [category, name, suffix].filter(Boolean).join('-');
}

/** Angka acak 3 digit sebagai pembeda SKU usulan. */
export const randomSkuSuffix = (): string => String(Math.floor(Math.random() * 900) + 100);
