import { describe, expect, it } from 'vitest';
import {
  incidentCreateSchema,
  incidentReviewSchema,
  serviceTicketCompleteSchema,
} from './incidents';
import { hasCapability } from './rbac';

const QR = 'abcdefghijklmnopqrstuvwx';

describe('incidents — skema', () => {
  it('laporan memerlukan tepat satu pengenal aset dan deskripsi yang memadai', () => {
    const base = { urgency: 'HIGH', description: 'Panel pecah' } as const;
    expect(incidentCreateSchema.safeParse({ ...base, qrToken: QR }).success).toBe(true);
    expect(incidentCreateSchema.safeParse({ ...base, assetCode: 'ast-000001' }).success).toBe(true);
    expect(incidentCreateSchema.safeParse(base).success).toBe(false);
    expect(
      incidentCreateSchema.safeParse({ ...base, qrToken: QR, assetCode: 'AST-000001' }).success,
    ).toBe(false);
    expect(incidentCreateSchema.safeParse({ ...base, qrToken: QR, description: 'x' }).success).toBe(
      false,
    );
  });

  it('keputusan: panduan/tolak wajib catatan, teknisi wajib nama, penggantian bebas', () => {
    expect(incidentReviewSchema.safeParse({ decision: 'REJECT' }).success).toBe(false);
    expect(
      incidentReviewSchema.safeParse({ decision: 'REJECT', note: 'Tidak valid' }).success,
    ).toBe(true);
    expect(incidentReviewSchema.safeParse({ decision: 'GUIDANCE' }).success).toBe(false);
    expect(incidentReviewSchema.safeParse({ decision: 'TECHNICIAN' }).success).toBe(false);
    expect(
      incidentReviewSchema.safeParse({ decision: 'TECHNICIAN', technicianName: 'Pak Rudi' })
        .success,
    ).toBe(true);
    expect(incidentReviewSchema.safeParse({ decision: 'REPLACE' }).success).toBe(true);
  });

  it('penyelesaian servis menolak biaya negatif', () => {
    const base = {
      actionTaken: 'Ganti modul',
      inspection: 'PASSED',
      conditionAfter: 'GOOD',
    } as const;
    expect(serviceTicketCompleteSchema.safeParse({ ...base, cost: 1000 }).success).toBe(true);
    expect(serviceTicketCompleteSchema.safeParse({ ...base, cost: -1 }).success).toBe(false);
  });
});

describe('incidents — RBAC', () => {
  it('PIC lapangan hanya melapor/menerima; owner baca saja; gudang servis tanpa review', () => {
    expect(hasCapability('FIELD_PIC', 'incident.report')).toBe(true);
    expect(hasCapability('FIELD_PIC', 'replacement.receive')).toBe(true);
    expect(hasCapability('FIELD_PIC', 'incident.review')).toBe(false);
    expect(hasCapability('FIELD_PIC', 'warehouse.read')).toBe(false);
    expect(hasCapability('OWNER', 'incident.read')).toBe(true);
    expect(hasCapability('OWNER', 'incident.report')).toBe(false);
    expect(hasCapability('OWNER', 'service.write')).toBe(false);
    expect(hasCapability('WAREHOUSE', 'service.write')).toBe(true);
    expect(hasCapability('WAREHOUSE', 'incident.review')).toBe(false);
    expect(hasCapability('OPS_COORDINATOR', 'incident.review')).toBe(true);
    expect(hasCapability('ADMIN', 'replacement.receive')).toBe(true);
  });
});
