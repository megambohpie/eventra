import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import type { HealthResponse } from '@eventra/shared';
import { errorHandler, notFoundHandler } from './errors';

export interface AppDeps {
  /** Mengembalikan true bila database dapat dijangkau. */
  checkDb: () => Promise<boolean>;
}

export function createApp({ checkDb }: AppDeps): Express {
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
  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
