export interface LatLng {
  lat: number;
  lng: number;
}

const inRange = (lat: number, lng: number): boolean =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** Pembulatan 6 desimal (±0,1 m) agar nilai stabil dan rapi. */
export const roundCoord = (n: number): number => Math.round(n * 1e6) / 1e6;

/**
 * Membaca koordinat dari teks hasil salin Google Maps: "-6.2088, 106.8456",
 * atau URL (`@lat,lng`, `!3dlat!4dlng`, `?q=lat,lng`, `?ll=lat,lng`). Mengembalikan null bila tidak valid.
 * Tautan pendek (maps.app.goo.gl) tidak berisi koordinat dan tidak dapat dibaca.
 */
export function parseCoordinates(input: string): LatLng | null {
  const text = input.trim();
  if (!text) return null;
  const num = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
  const patterns = [
    new RegExp(String.raw`^${num}\s*[,;\s]\s*${num}$`),
    new RegExp(`!3d${num}!4d${num}`),
    new RegExp(`@${num},${num}`),
    new RegExp(String.raw`[?&](?:q|ll|query|destination)=${num}(?:,|%2C)${num}`),
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(text);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (inRange(lat, lng)) return { lat: roundCoord(lat), lng: roundCoord(lng) };
  }
  return null;
}

export const formatCoordinates = ({ lat, lng }: LatLng): string =>
  `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

/** Tautan Google Maps untuk membuka titik tersebut. */
export const googleMapsUrl = ({ lat, lng }: LatLng): string =>
  `https://www.google.com/maps?q=${lat},${lng}`;

export interface GeocodeResultDto extends LatLng {
  /** Nama lengkap tempat/alamat hasil pencarian. */
  label: string;
}
