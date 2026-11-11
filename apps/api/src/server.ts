import { PrismaClient } from '@prisma/client';
import { apiEnvSchema, parseEnv } from '@eventra/shared';
import { createApp } from './app';
import type { Mailer } from './routes/auth';

const env = parseEnv(apiEnvSchema, process.env);
const prisma = new PrismaClient();

// Pengiriman email belum tersedia (fase rilis). Di development token dicetak ke log agar alur dapat diuji;
// di production tidak ada yang dicetak sehingga token tidak bocor ke log.
const mailer: Mailer = {
  sendPasswordReset: async (to, token) => {
    if (env.NODE_ENV !== 'production') {
      console.log(`[dev] Token reset password untuk ${to.email}: ${token}`);
    }
  },
};

const app = createApp({
  checkDb: async () => {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  },
  db: prisma,
  jwtSecret: env.JWT_SECRET,
  mailer,
});

const server = app.listen(env.PORT, () => {
  console.log(`API Eventra berjalan di http://localhost:${env.PORT}/api/v1`);
});

async function shutdown(): Promise<void> {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
