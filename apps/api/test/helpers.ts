import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { Express } from 'express';
import type { Role } from '@eventra/shared';
import { createApp } from '../src/app';
import { hashPassword } from '../src/auth/password';
import type { Mailer } from '../src/routes/auth';
import { TEST_DATABASE_URL } from './testDb';

export const JWT_SECRET = 'test-secret-test-secret-test-secret-123';
export const PASSWORD = 'Password123!';

export const db = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });

export interface TestApp {
  app: Express;
  sentResets: { email: string; token: string }[];
}

export function createTestApp(checkDb: () => Promise<boolean> = async () => true): TestApp {
  const sentResets: TestApp['sentResets'] = [];
  const mailer: Mailer = {
    sendPasswordReset: async (to, token) => {
      sentResets.push({ email: to.email, token });
    },
  };
  return { app: createApp({ checkDb, db, jwtSecret: JWT_SECRET, mailer }), sentResets };
}

/** Kosongkan semua tabel (kecuali _prisma_migrations) antar test. */
export async function resetDb(): Promise<void> {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE asset_status_events, assets, stock_receipt_items, stock_receipts, audit_logs, refresh_tokens, password_reset_tokens, customers, products, categories, locations, users RESTART IDENTITY CASCADE',
  );
}

export async function createUser(role: Role, email = `${role.toLowerCase()}@test.local`) {
  return db.user.create({
    data: { name: `User ${role}`, email, passwordHash: await hashPassword(PASSWORD), role },
  });
}

/** Buat user dengan role tertentu lalu login; mengembalikan access token. */
export async function loginAs(app: Express, role: Role): Promise<string> {
  const user = await createUser(role);
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: user.email, password: PASSWORD });
  return (res.body as { data: { accessToken: string } }).data.accessToken;
}
