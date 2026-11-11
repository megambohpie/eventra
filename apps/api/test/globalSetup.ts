import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { TEST_DATABASE_URL, adminUrl, testDbName } from './testDb';

/** Membuat database uji bila belum ada, lalu menerapkan semua migrasi. */
export default async function setup(): Promise<void> {
  const name = testDbName(TEST_DATABASE_URL);
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Nama database uji tidak valid: ${name}`);
  const admin = new PrismaClient({ datasourceUrl: adminUrl(TEST_DATABASE_URL) });
  try {
    const rows = await admin.$queryRaw<
      { n: number }[]
    >`SELECT 1 AS n FROM pg_database WHERE datname = ${name}`;
    if (rows.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.$disconnect();
  }
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
