import type { Request, RequestHandler } from 'express';
import { HttpError } from '../errors';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Kunci pengelompokan; default alamat IP. */
  key?: (req: Request) => string;
  now?: () => number;
}

/**
 * Pembatas laju jendela-tetap di memori (tanpa dependensi). Cukup untuk satu instance API;
 * bila di-scale horizontal, ganti penyimpanan dengan Redis (lihat RUNBOOK.md).
 */
export function rateLimit(opts: RateLimitOptions): RequestHandler {
  const now = opts.now ?? Date.now;
  const hits = new Map<string, { count: number; resetAt: number }>();
  let lastSweep = now();

  return (req, res, next) => {
    const t = now();
    if (t - lastSweep > opts.windowMs) {
      for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
      lastSweep = t;
    }
    const key = opts.key ? opts.key(req) : (req.ip ?? 'unknown');
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + opts.windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    res.setHeader('RateLimit-Limit', String(opts.max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, opts.max - entry.count)));
    if (entry.count > opts.max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - t) / 1000))));
      throw new HttpError(429, 'RATE_LIMITED', 'Terlalu banyak permintaan, coba lagi nanti');
    }
    next();
  };
}

export interface RateLimitConfig {
  /** Seluruh API per IP. */
  global: { windowMs: number; max: number };
  /** Login per IP+email dan per IP. */
  login: { windowMs: number; max: number; maxPerIp: number };
  /** Refresh token per IP. */
  refresh: { windowMs: number; max: number };
  /** Permintaan reset password per IP. */
  reset: { windowMs: number; max: number };
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  global: { windowMs: 60_000, max: 600 },
  login: { windowMs: 15 * 60_000, max: 10, maxPerIp: 50 },
  refresh: { windowMs: 15 * 60_000, max: 100 },
  reset: { windowMs: 60 * 60_000, max: 10 },
};

export const emailKey = (req: Request): string => {
  const body = req.body as { email?: unknown } | undefined;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  return `${req.ip ?? 'unknown'}|${email}`;
};
