import { PrismaClient } from '@prisma/client';
import { apiEnvSchema, parseEnv } from '@eventra/shared';
import { createApp } from './app';
import { sendDueReminders } from './finance/service';
import { expireHolds } from './orders/service';
import { logErrorReporter } from './ops/errorReporter';
import { JobMonitor } from './ops/jobs';
import { createLogger } from './ops/logger';
import type { Mailer } from './routes/auth';

const env = parseEnv(apiEnvSchema, process.env);
const logger = createLogger(env.LOG_LEVEL);
const reporter = logErrorReporter(logger);
const prisma = new PrismaClient();

// Pengiriman email belum tersedia (menunggu keputusan penyedia). Di development token dicetak ke log
// agar alur dapat diuji; di production tidak ada yang dicetak sehingga token tidak bocor ke log.
const mailer: Mailer = {
  sendPasswordReset: async (to, token) => {
    if (env.NODE_ENV !== 'production') {
      logger.info('dev_password_reset_token', { email: to.email, token });
    }
  },
};

const jobs = new JobMonitor(logger, reporter);

const app = createApp({
  checkDb: async () => {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  },
  db: prisma,
  jwtSecret: env.JWT_SECRET,
  mailer,
  logger,
  reporter,
  jobs,
  corsOrigins: env.CORS_ORIGINS,
  trustProxy: env.TRUST_PROXY,
});

const server = app.listen(env.PORT, () => {
  logger.info('api_started', { port: env.PORT, env: env.NODE_ENV });
});

// Job hold expiry: melepaskan stok hold pembayaran yang kadaluarsa. Ketersediaan sudah mengabaikan
// hold kadaluarsa, jadi job ini hanya merapikan status pesanan (EXPIRED) dan alokasi (RELEASED).
// Aman dijalankan berulang/bersamaan (klaim atomik per pesanan); status terlihat di /health/ready.
jobs.schedule('hold-expiry', 60_000, () => expireHolds(prisma));

// Pengingat tagihan: jatuh tempo ≤ 3 hari atau terlambat, maksimal satu per invoice per 24 jam (in-app).
jobs.schedule('invoice-reminders', 15 * 60_000, () => sendDueReminders(prisma));

let shuttingDown = false;
async function shutdown(code: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('api_shutdown', { code });
  jobs.stop();
  // Beri waktu 10 dtk bagi request berjalan, lalu paksa keluar.
  const force = setTimeout(() => process.exit(code || 1), 10_000);
  force.unref();
  server.close();
  await prisma.$disconnect().catch(() => undefined);
  process.exit(code);
}
process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));
process.on('unhandledRejection', (err) => {
  reporter.report(err, { source: 'process' });
});
process.on('uncaughtException', (err) => {
  reporter.report(err, { source: 'process' });
  void shutdown(1);
});
