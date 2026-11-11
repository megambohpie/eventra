import { z } from 'zod';
import { listQuerySchema, type ListQuery } from '@eventra/shared';
import { HttpError } from './errors';

const uuid = z.uuid();

/** Validasi param :id; id tak valid menjadi 404 (bukan error database). */
export function parseId(value: unknown): string {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw new HttpError(404, 'NOT_FOUND', 'Data tidak ditemukan');
  return parsed.data;
}

export const parseListQuery = (query: unknown): ListQuery => listQuerySchema.parse(query);
