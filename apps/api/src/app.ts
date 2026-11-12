import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import type { PrismaClient } from '@prisma/client';
import type { HealthResponse } from '@eventra/shared';
import { authenticate } from './auth/middleware';
import { createErrorHandler, notFoundHandler } from './errors';
import { logErrorReporter, type ErrorReporter } from './ops/errorReporter';
import type { JobMonitor } from './ops/jobs';
import { accessLog, createLogger, requestId, type Logger } from './ops/logger';
import { DEFAULT_RATE_LIMITS, emailKey, rateLimit, type RateLimitConfig } from './ops/rateLimit';
import { assetsRouter } from './routes/assets';
import { availabilityRouter } from './routes/availability';
import { bundlesRouter } from './routes/bundles';
import { ordersRouter } from './routes/orders';
import { authRouter, type Mailer } from './routes/auth';
import { receiptsRouter } from './routes/receipts';
import { customersRouter } from './routes/customers';
import { masterRouter } from './routes/master';
import { productsRouter } from './routes/products';
import { usersRouter } from './routes/users';
import { warehouseRouter } from './routes/warehouse';
import { incidentsRouter } from './routes/incidents';
import { notificationsRouter } from './routes/notifications';
import { replacementsRouter } from './routes/replacements';
import { serviceTicketsRouter } from './routes/serviceTickets';
import { financeRouter } from './routes/finance';
import { dashboardsRouter } from './routes/dashboards';

export interface AppDeps {
  /** Mengembalikan true bila database dapat dijangkau. */
  checkDb: () => Promise<boolean>;
  db: PrismaClient;
  jwtSecret: string;
  mailer: Mailer;
  logger?: Logger;
  reporter?: ErrorReporter;
  /** Monitor job berkala; ditampilkan di /health/ready. */
  jobs?: JobMonitor;
  /** Origin web yang diizinkan; kosong = semua origin (hanya untuk development). */
  corsOrigins?: string[];
  /** Hop reverse proxy tepercaya. */
  trustProxy?: number;
  /** Batas laju; false untuk mematikan (hanya test). */
  rateLimits?: RateLimitConfig | false;
}

export function createApp({
  checkDb,
  db,
  jwtSecret,
  mailer,
  logger = createLogger(),
  reporter = logErrorReporter(logger),
  jobs,
  corsOrigins = [],
  trustProxy = 0,
  rateLimits = DEFAULT_RATE_LIMITS,
}: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.use(requestId);
  app.use(accessLog(logger));
  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins.length > 0 ? corsOrigins : true,
      maxAge: 600,
      exposedHeaders: ['x-request-id', 'Retry-After'],
    }),
  );
  // Respons API berisi data bisnis/QR; jangan disimpan cache bersama atau browser.
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  const v1 = express.Router();
  if (rateLimits) {
    v1.use(rateLimit(rateLimits.global));
    const { login, refresh, reset } = rateLimits;
    v1.post('/auth/login', rateLimit({ ...login, key: emailKey }));
    v1.post('/auth/login', rateLimit({ windowMs: login.windowMs, max: login.maxPerIp }));
    v1.post('/auth/refresh', rateLimit(refresh));
    v1.post('/auth/password-reset/request', rateLimit(reset));
    v1.post('/auth/password-reset/confirm', rateLimit(reset));
  }
  v1.get('/health', async (_req, res) => {
    const dbUp = await checkDb().catch(() => false);
    const data: HealthResponse = {
      status: dbUp ? 'ok' : 'degraded',
      db: dbUp ? 'up' : 'down',
      time: new Date().toISOString(),
    };
    res.status(dbUp ? 200 : 503).json({ data });
  });
  // Liveness: proses hidup. Readiness: DB dapat dijangkau dan job berkala sehat.
  v1.get('/health/live', (_req, res) => {
    res.json({ data: { status: 'ok' } });
  });
  v1.get('/health/ready', async (_req, res) => {
    const dbUp = await checkDb().catch(() => false);
    const jobStatus = jobs?.status() ?? [];
    const healthy = dbUp && jobStatus.every((j) => !j.stale);
    res.status(healthy ? 200 : 503).json({
      data: {
        status: healthy ? 'ok' : 'degraded',
        db: dbUp ? 'up' : 'down',
        jobs: jobStatus,
        time: new Date().toISOString(),
      },
    });
  });

  // Publik: login, refresh, logout, reset password. /me diautentikasi di dalam router-nya.
  v1.use(authRouter(db, jwtSecret, mailer));

  // Semua rute di bawah ini wajib login; capability diperiksa per endpoint.
  const protectedRouter = express.Router();
  protectedRouter.use(authenticate(db, jwtSecret));
  protectedRouter.use(usersRouter(db));
  protectedRouter.use(customersRouter(db));
  protectedRouter.use(productsRouter(db));
  protectedRouter.use(masterRouter(db));
  protectedRouter.use(assetsRouter(db));
  protectedRouter.use(receiptsRouter(db));
  protectedRouter.use(bundlesRouter(db));
  protectedRouter.use(availabilityRouter(db));
  protectedRouter.use(ordersRouter(db));
  protectedRouter.use(warehouseRouter(db));
  protectedRouter.use(incidentsRouter(db));
  protectedRouter.use(replacementsRouter(db));
  protectedRouter.use(serviceTicketsRouter(db));
  protectedRouter.use(notificationsRouter(db));
  protectedRouter.use(financeRouter(db));
  protectedRouter.use(dashboardsRouter(db));
  v1.use(protectedRouter);

  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(createErrorHandler(reporter));
  return app;
}
