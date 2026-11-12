import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import type { PrismaClient } from '@prisma/client';
import type { HealthResponse } from '@eventra/shared';
import { authenticate } from './auth/middleware';
import { errorHandler, notFoundHandler } from './errors';
import { assetsRouter } from './routes/assets';
import { authRouter, type Mailer } from './routes/auth';
import { receiptsRouter } from './routes/receipts';
import { customersRouter } from './routes/customers';
import { masterRouter } from './routes/master';
import { productsRouter } from './routes/products';
import { usersRouter } from './routes/users';

export interface AppDeps {
  /** Mengembalikan true bila database dapat dijangkau. */
  checkDb: () => Promise<boolean>;
  db: PrismaClient;
  jwtSecret: string;
  mailer: Mailer;
}

export function createApp({ checkDb, db, jwtSecret, mailer }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  const v1 = express.Router();
  v1.get('/health', async (_req, res) => {
    const dbUp = await checkDb().catch(() => false);
    const data: HealthResponse = {
      status: dbUp ? 'ok' : 'degraded',
      db: dbUp ? 'up' : 'down',
      time: new Date().toISOString(),
    };
    res.status(dbUp ? 200 : 503).json({ data });
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
  v1.use(protectedRouter);

  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
