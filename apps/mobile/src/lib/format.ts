const pad = (n: number) => String(n).padStart(2, '0');

/** Tanggal murni `YYYY-MM-DD` → `DD/MM/YYYY` tanpa pergeseran zona waktu. */
export const formatDate = (value: string): string => {
  const [y, m, d] = value.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

/** Timestamp ISO → waktu perangkat `DD/MM/YYYY HH:mm` (tanpa Intl: dukungan Hermes bervariasi). */
export const formatDateTime = (value: string): string => {
  const d = new Date(value);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** `AVAILABLE` → `Available`; label bahasa Indonesia ada di strings.ts. */
export const humanize = (value: string): string =>
  value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
