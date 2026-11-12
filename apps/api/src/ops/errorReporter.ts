import type { Logger } from './logger';

export interface ErrorContext {
  requestId?: string;
  route?: string;
  userId?: string;
  source: 'request' | 'job' | 'process';
}

/**
 * Titik masuk monitoring error. Default menulis ke log terstruktur (level error) agar dapat
 * diteruskan agregator. Penyedia nyata (Sentry/webhook) cukup mengimplementasikan antarmuka ini.
 */
export interface ErrorReporter {
  report(err: unknown, ctx: ErrorContext): void;
}

export const serializeError = (err: unknown): { name: string; message: string; stack?: string } =>
  err instanceof Error
    ? { name: err.name, message: err.message, stack: err.stack }
    : { name: 'NonError', message: String(err) };

export const logErrorReporter = (logger: Logger): ErrorReporter => ({
  report: (err, ctx) => logger.error('unhandled_error', { ...ctx, err: serializeError(err) }),
});
