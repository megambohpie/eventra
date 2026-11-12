import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Logger JSON satu baris per entri (mudah dikirim ke agregator log). */
export function createLogger(minLevel: LogLevel = 'info'): Logger {
  const write = (level: LogLevel, msg: string, fields?: Fields) => {
    if (ORDER[level] < ORDER[minLevel]) return;
    const out = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
    out.write(`${JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields })}\n`);
  };
  return {
    debug: (m, f) => write('debug', m, f),
    info: (m, f) => write('info', m, f),
    warn: (m, f) => write('warn', m, f),
    error: (m, f) => write('error', m, f),
  };
}

export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

declare module 'express-serve-static-core' {
  interface Request {
    id?: string;
  }
}

const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Beri setiap request id (atau teruskan `x-request-id` yang aman) dan kembalikan di header respons. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
};

/**
 * Access log. Memakai TEMPLATE rute (mis. `/assets/scan/:token`), bukan URL asli, sehingga token QR,
 * token reset, dan query string tidak pernah masuk log.
 */
export const accessLog =
  (logger: Logger): RequestHandler =>
  (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const route = req.route as { path?: unknown } | undefined;
      const template = typeof route?.path === 'string' ? `${req.baseUrl}${route.path}` : undefined;
      const status = res.statusCode;
      const fields = {
        id: req.id,
        method: req.method,
        route: template ?? 'unmatched',
        status,
        ms: Number((process.hrtime.bigint() - start) / 1_000n) / 1000,
        user: req.user?.id,
      };
      if (status >= 500) logger.error('request', fields);
      else if (status >= 400) logger.warn('request', fields);
      else logger.info('request', fields);
    });
    next();
  };
