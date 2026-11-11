import type { Request } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

const SENSITIVE_KEYS = new Set(['passwordHash', 'password', 'token', 'tokenHash']);

/** Buang field rahasia dari snapshot sebelum masuk audit log. */
export function redact(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (key, v: unknown) =>
      SENSITIVE_KEYS.has(key) ? undefined : typeof v === 'bigint' ? Number(v) : v,
    ),
  ) as Prisma.InputJsonValue;
}

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  actorId?: string;
}

/** Audit log append-only; dipanggil pada setiap operasi tulis. */
export async function writeAudit(db: Db, req: Request, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId ?? req.user?.id,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: redact(entry.before),
      after: redact(entry.after),
      ip: req.ip,
      device: req.header('user-agent')?.slice(0, 200),
    },
  });
}
