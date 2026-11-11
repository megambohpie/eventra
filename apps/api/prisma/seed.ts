import { PrismaClient } from '@prisma/client';
import { emailSchema, passwordSchema } from '@eventra/shared';
import { hashPassword } from '../src/auth/password';

/** Membuat admin pertama dari env (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD). Idempoten. */
async function main(): Promise<void> {
  const email = emailSchema.parse(process.env.SEED_ADMIN_EMAIL);
  const password = passwordSchema.parse(process.env.SEED_ADMIN_PASSWORD);
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`Admin ${email} sudah ada; dilewati.`);
      return;
    }
    const user = await prisma.user.create({
      data: {
        name: 'Administrator',
        email,
        passwordHash: await hashPassword(password),
        role: 'ADMIN',
      },
    });
    await prisma.auditLog.create({
      data: { action: 'user.seed_admin', entity: 'user', entityId: user.id },
    });
    console.log(`Admin ${email} dibuat.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
