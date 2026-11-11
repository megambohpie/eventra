const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

/** Format nominal rupiah (integer) untuk tampilan. */
export const formatRupiah = (amount: number): string => rupiah.format(amount);
