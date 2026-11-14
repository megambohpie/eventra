/** Nama berkas unik per unduhan: `<base>-YYYYMMDD-HHmmss.<ext>` (waktu lokal perangkat). */
export function timestampedFilename(base: string, ext: string, date: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
  const time = `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
  return `${base}-${day}-${time}.${ext}`;
}

/** Menyimpan Blob hasil backend (mis. PDF label) sebagai berkas unduhan. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
