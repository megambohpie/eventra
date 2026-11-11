/** Database uji terpisah dari database dev agar test boleh mengosongkan tabel. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://eventra:eventra@localhost:5433/eventra_test?schema=public';

export function adminUrl(url: string): string {
  const u = new URL(url);
  u.pathname = '/postgres';
  return u.toString();
}

export const testDbName = (url: string): string => new URL(url).pathname.slice(1);
