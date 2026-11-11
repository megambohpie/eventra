import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import type { ApiError } from '@eventra/shared';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, 'NOT_FOUND', `Rute ${req.method} ${req.path} tidak ditemukan`));
};

// Express mengenali error handler dari 4 argumen, jadi `_next` wajib ada.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  let status = 500;
  let body: ApiError = { error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server' } };

  if (err instanceof HttpError) {
    status = err.status;
    body = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.fields ? { fields: err.fields } : {}),
      },
    };
  } else if (err instanceof ZodError) {
    status = 400;
    const fields: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      (fields[key] ??= []).push(issue.message);
    }
    body = { error: { code: 'VALIDATION_ERROR', message: 'Permintaan tidak valid', fields } };
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    status = 409;
    body = { error: { code: 'DUPLICATE', message: 'Data dengan nilai tersebut sudah ada' } };
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
    status = 400;
    body = { error: { code: 'INVALID_REFERENCE', message: 'Referensi data tidak valid' } };
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    status = 404;
    body = { error: { code: 'NOT_FOUND', message: 'Data tidak ditemukan' } };
  } else if (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    (err as { type: unknown }).type === 'entity.parse.failed'
  ) {
    status = 400;
    body = { error: { code: 'INVALID_JSON', message: 'Body JSON tidak valid' } };
  } else {
    console.error(err);
  }

  res.status(status).json(body);
};
