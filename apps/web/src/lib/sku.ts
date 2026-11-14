const letters = (text: string, max: number): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, max);

/** Usulan SKU: awalan kategori + nama produk + angka acak (mengurangi tabrakan). Kosong bila nama kosong. */
export function suggestSku(categoryName: string, productName: string, suffix: string): string {
  const name = letters(productName, 6);
  if (!name) return '';
  const category = letters(categoryName, 3);
  return [category, name, suffix].filter(Boolean).join('-');
}

/** Angka acak 3 digit sebagai pembeda SKU usulan. */
export const randomSkuSuffix = (): string => String(Math.floor(Math.random() * 900) + 100);
