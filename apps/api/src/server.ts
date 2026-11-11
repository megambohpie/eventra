import { PrismaClient } from '@prisma/client';
import { apiEnvSchema, parseEnv } from '@eventra/shared';
import { createApp } from './app';

const env = parseEnv(apiEnvSchema, process.env);
const prisma = new PrismaClient();

const app = createApp({
  checkDb: async () => {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  },
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
