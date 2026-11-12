const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

/** Format nominal rupiah (integer) untuk tampilan. */
export const formatRupiah = (amount: number): string => rupiah.format(amount);

const dateOnly = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'UTC' });
const dateTime = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

/** Tanggal murni (`YYYY-MM-DD`) tanpa pergeseran zona waktu. */
export const formatDate = (value: string): string => dateOnly.format(new Date(value));
/** Waktu kejadian (ISO timestamp) pada zona waktu perangkat. */
export const formatDateTime = (value: string): string => dateTime.format(new Date(value));

/** Sisakan angka saja untuk input telepon; tanda + hanya boleh di awal. */
export const sanitizePhone = (value: string): string =>
  value.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
