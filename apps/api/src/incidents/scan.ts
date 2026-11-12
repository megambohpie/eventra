import type { Request } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { ScanAction, ScanMethod } from '@eventra/shared';
import { writeAudit } from '../audit';
import { QR_TOKEN_PATTERN } from '../assets/service';
import { currentUser } from '../auth/middleware';
import { ScanRejected, type Tx } from '../warehouse/service';

export interface ScanContext {
  action: ScanAction;
  method: ScanMethod;
  entity: 'incident' | 'replacement_task';
  entityId?: string;
  orderId?: string;
  incidentId?: string;
  replacementTaskId?: string;
}

/**
 * Jalankan scan dalam transaksi. Penolakan bisnis (ScanRejected) membatalkan transaksi lalu dicatat
 * sebagai scan event REJECTED + audit di luar transaksi, sehingga percobaan scan salah tetap berjejak
 * (pola yang sama dengan scan pick list Fase 04).
 */
export async function guardedScan<T>(
  db: PrismaClient,
  req: Request,
  ctx: ScanContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  try {
    return await db.$transaction(fn);
  } catch (error) {
    if (error instanceof ScanRejected) {
      await db.scanEvent.create({
        data: {
          action: ctx.action,
          result: 'REJECTED',
          method: ctx.method,
          reason: error.code,
          orderId: ctx.orderId ?? null,
          incidentId: ctx.incidentId ?? null,
          replacementTaskId: ctx.replacementTaskId ?? null,
          assetId: error.assetId,
          actorId: currentUser(req).id,
        },
      });
      await writeAudit(db, req, {
        action: 'scan.rejected',
        entity: ctx.entity,
        entityId: ctx.entityId,
        after: { scanAction: ctx.action, reason: error.code, assetId: error.assetId },
      });
    }
    throw error;
  }
}

export async function resolveAsset(tx: Tx, input: { qrToken?: string; assetCode?: string }) {
  const asset = input.qrToken
    ? QR_TOKEN_PATTERN.test(input.qrToken)
      ? await tx.asset.findUnique({ where: { qrToken: input.qrToken } })
      : null
    : await tx.asset.findUnique({ where: { code: input.assetCode ?? '' } });
  if (!asset) throw new ScanRejected('SCAN_UNKNOWN_QR', 'QR/kode aset tidak dikenal', null, 404);
  return asset;
}
