/**
 * QR Eventra hanya berisi token acak (tanpa data sensitif). Hasil pemindaian dibersihkan dan
 * dicek bentuknya sebelum dikirim; validasi sebenarnya tetap di API.
 */
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

export function parseQrToken(raw: string): string | null {
  const value = raw.trim();
  return TOKEN.test(value) ? value : null;
}

const ASSET_CODE = /^[A-Z0-9-]{3,40}$/;

/** Kode aset manual (mis. `AST-000123`) untuk QR yang rusak; huruf besar otomatis. */
export function parseAssetCode(raw: string): string | null {
  const value = raw.trim().toUpperCase();
  return ASSET_CODE.test(value) ? value : null;
}

/**
 * Pemindai kamera memicu callback berulang untuk QR yang sama. Cooldown mencegah satu QR
 * terkirim dua kali (dan tercatat ganda sebagai scan event).
 */
export function createScanGate(cooldownMs = 2000, now: () => number = Date.now) {
  let lastValue = '';
  let lastAt = -Infinity;
  return (value: string): boolean => {
    const t = now();
    if (value === lastValue && t - lastAt < cooldownMs) return false;
    lastValue = value;
    lastAt = t;
    return true;
  };
}
