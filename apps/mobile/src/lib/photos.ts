import { MAX_PHOTO_BYTES, PHOTO_MIME_TYPES } from '@eventra/shared';

export type PhotoMime = (typeof PHOTO_MIME_TYPES)[number];

export interface PickedPhoto {
  uri: string;
  mimeType: PhotoMime;
  /** Byte hasil dekode, siap dikirim sebagai body mentah. */
  data: ArrayBuffer;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP: Record<string, number> = Object.fromEntries([...ALPHABET].map((c, i) => [c, i]));

/** Dekode base64 tanpa bergantung pada `atob`/`Buffer` (tidak ada di semua runtime RN). */
export function base64ToArrayBuffer(input: string): ArrayBuffer {
  const clean = input.replace(/^data:[^,]*,/, '').replace(/[\s=]+/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const char of clean) {
    const value = LOOKUP[char];
    if (value === undefined) throw new Error('Data foto tidak valid');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[index++] = (buffer >> bits) & 0xff;
    }
  }
  return bytes.buffer.slice(0, index) as ArrayBuffer;
}

export type PhotoRejection = 'TYPE' | 'SIZE' | 'EMPTY';

const isMime = (value: string | null | undefined): value is PhotoMime =>
  (PHOTO_MIME_TYPES as readonly string[]).includes(value ?? '');

/** Samakan batas dengan backend (JPEG/PNG, ≤ 3 MB) agar ditolak sebelum diunggah. */
export function toPickedPhoto(input: {
  uri: string;
  mimeType?: string | null;
  base64?: string | null;
}): { photo: PickedPhoto } | { error: PhotoRejection } {
  if (!input.base64) return { error: 'EMPTY' };
  const mimeType = input.mimeType ?? (/\.png$/i.test(input.uri) ? 'image/png' : 'image/jpeg');
  if (!isMime(mimeType)) return { error: 'TYPE' };
  const data = base64ToArrayBuffer(input.base64);
  if (data.byteLength === 0) return { error: 'EMPTY' };
  if (data.byteLength > MAX_PHOTO_BYTES) return { error: 'SIZE' };
  return { photo: { uri: input.uri, mimeType, data } };
}
