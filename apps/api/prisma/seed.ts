import { PrismaClient } from '@prisma/client';
import { demoAccountEmail, emailSchema, passwordSchema, ROLES } from '@eventra/shared';
import { hashPassword } from '../src/auth/password';

/**
 * Membuat admin pertama dari env (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD). Idempoten.
 * Bila SEED_DEMO_PASSWORD diisi, juga membuat satu akun contoh per role (khusus development).
 */
async function main(): Promise<void> {
  const email = emailSchema.parse(process.env.SEED_ADMIN_EMAIL);
  const password = passwordSchema.parse(process.env.SEED_ADMIN_PASSWORD);
  const prisma = new PrismaClient();
  try {
    await seedAdmin(prisma, email, password);
    const demoPassword = process.env.SEED_DEMO_PASSWORD;
    if (demoPassword) await seedDemoUsers(prisma, passwordSchema.parse(demoPassword));
  } finally {
    await prisma.$disconnect();
  }
}

async function seedAdmin(prisma: PrismaClient, email: string, password: string): Promise<void> {
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
}

async function seedDemoUsers(prisma: PrismaClient, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  for (const role of ROLES) {
    const email = demoAccountEmail(role);
    if (await prisma.user.findUnique({ where: { email } })) {
      console.log(`Akun contoh ${email} sudah ada; dilewati.`);
      continue;
    }
    const user = await prisma.user.create({
      data: { name: `Contoh ${role}`, email, passwordHash, role },
    });
    await prisma.auditLog.create({
      data: { action: 'user.seed_demo', entity: 'user', entityId: user.id },
    });
    console.log(`Akun contoh ${email} (${role}) dibuat.`);
  }
}

void main();
