import bcrypt from 'bcryptjs';

const COST = 12;
// Hash tiruan agar waktu login untuk email tak dikenal mirip dengan email yang dikenal.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', COST);

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, COST);

export async function verifyPassword(password: string, hash: string | undefined): Promise<boolean> {
  const ok = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return hash !== undefined && ok;
}
