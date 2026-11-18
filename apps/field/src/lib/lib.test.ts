import { describe, expect, it } from 'vitest';
import type { IncidentSummaryDto, PickListSummaryDto, ReplacementTaskDto } from '@eventra/shared';
import { createScanGate, parseAssetCode, parseQrToken } from './qr';
import { buildTasks, fieldAccess, taskSourcesFor } from './tasks';
import { formatDate } from './format';

describe('qr', () => {
  it('menerima token yang bentuknya benar dan menolak sisanya', () => {
    expect(parseQrToken('  abcDEF0123456789_-xyz  ')).toBe('abcDEF0123456789_-xyz');
    expect(parseQrToken('pendek')).toBeNull();
    expect(parseQrToken('https://evil.example/abcdefghijklmnop')).toBeNull();
    expect(parseQrToken('a'.repeat(65))).toBeNull();
  });

  it('merapikan kode aset manual', () => {
    expect(parseAssetCode(' ast-000123 ')).toBe('AST-000123');
    expect(parseAssetCode('ab')).toBeNull();
    expect(parseAssetCode('AST 1')).toBeNull();
  });

  it('gerbang scan menahan QR yang sama selama cooldown', () => {
    let t = 1000;
    const gate = createScanGate(2000, () => t);
    expect(gate('A')).toBe(true);
    expect(gate('A')).toBe(false);
    expect(gate('B')).toBe(true);
    t += 2500;
    expect(gate('B')).toBe(true);
  });
});

const pickList = (over: Partial<PickListSummaryDto>): PickListSummaryDto => ({
  id: 'p1',
  number: 'PKL-2026-000001',
  orderId: 'o1',
  orderNumber: 'ORD-2026-000001',
  orderStatus: 'SCHEDULED',
  customerName: 'PT Maju',
  status: 'OPEN',
  startDate: '2026-11-20',
  endDate: '2026-11-21',
  eventLocation: 'Jakarta',
  required: 4,
  picked: 2,
  documents: [],
  verified: 1,
  dispatchedAt: null,
  returnedAt: null,
  createdAt: '2026-11-12T00:00:00.000Z',
  ...over,
});

const replacement = (over: Partial<ReplacementTaskDto>): ReplacementTaskDto => ({
  id: 'r1',
  number: 'RPL-2026-000001',
  status: 'DISPATCHED',
  incidentId: 'i1',
  incidentNumber: 'INC-2026-000001',
  urgency: 'HIGH',
  orderId: 'o1',
  orderNumber: 'ORD-2026-000001',
  eventLocation: 'Bandung',
  productId: 'pr1',
  productName: 'Panel LED',
  oldAsset: { id: 'a1', code: 'AST-000001' },
  replacementAsset: { id: 'a2', code: 'AST-000002' },
  pickedAt: null,
  verifiedAt: null,
  dispatchedAt: null,
  receivedAt: null,
  receivedBy: null,
  receiveCondition: null,
  receiveNote: null,
  createdAt: '2026-11-12T01:00:00.000Z',
  ...over,
});

const incident = (over: Partial<IncidentSummaryDto>): IncidentSummaryDto => ({
  id: 'i1',
  number: 'INC-2026-000001',
  status: 'REPORTED',
  urgency: 'MEDIUM',
  assetId: 'a1',
  assetCode: 'AST-000001',
  productName: 'Panel LED',
  orderId: 'o1',
  orderNumber: 'ORD-2026-000001',
  customerName: 'PT Maju',
  eventLocation: 'Bandung',
  reporter: 'Budi',
  photoCount: 1,
  replacementStatus: null,
  reportedAt: '2026-11-12T02:00:00.000Z',
  createdAt: '2026-11-12T02:00:00.000Z',
  ...over,
});

describe('tugas saya', () => {
  it('gudang melihat pick list aktif dan penyiapan pengganti, bukan yang final', () => {
    const tasks = buildTasks('WAREHOUSE', {
      pickLists: [
        pickList({ id: 'a', status: 'OPEN' }),
        pickList({ id: 'b', status: 'RETURNED' }),
        pickList({ id: 'c', status: 'CANCELLED' }),
        pickList({ id: 'd', status: 'RETURN_ISSUE' }),
      ],
      replacements: [
        replacement({ id: 'x', status: 'PENDING_PICK' }),
        replacement({ id: 'y', status: 'RECEIVED' }),
      ],
    });
    expect(tasks.map((t) => t.key).sort()).toEqual(['pl:a', 'pl:d', 'rp:x']);
    expect(tasks[0]?.key).toBe('pl:d');
  });

  it('PIC lapangan hanya melihat insiden dan penerimaan pengganti', () => {
    const tasks = buildTasks('FIELD_PIC', {
      pickLists: [pickList({})],
      replacements: [
        replacement({ id: 'x', status: 'DISPATCHED' }),
        replacement({ id: 'y', status: 'PENDING_PICK' }),
      ],
      incidents: [
        incident({ id: 'i1', status: 'DRAFT' }),
        incident({ id: 'i2', status: 'CLOSED' }),
        incident({ id: 'i3', status: 'REPORTED', urgency: 'CRITICAL' }),
      ],
    });
    expect(tasks.map((t) => t.key)).toEqual(['inc:i1', 'rp:x', 'inc:i3']);
    expect(tasks.find((t) => t.key === 'rp:x')?.kind).toBe('REPLACEMENT_RECEIVE');
  });

  it('sumber data dan akses mengikuti capability', () => {
    expect(taskSourcesFor('FIELD_PIC')).toEqual({
      pickLists: false,
      replacements: true,
      incidents: true,
    });
    // Pelanggan (portal) hanya melihat/melapor insiden pesanannya; tidak ada tugas gudang/pengganti.
    expect(taskSourcesFor('CUSTOMER')).toEqual({
      pickLists: false,
      replacements: false,
      incidents: true,
    });
    expect(fieldAccess('WAREHOUSE')).toMatchObject({
      scanWarehouse: true,
      reportIncident: false,
      viewDocuments: true,
    });
    expect(fieldAccess('FIELD_PIC')).toMatchObject({
      scanWarehouse: false,
      reportIncident: true,
      receiveReplacement: true,
      viewDocuments: false,
    });
    expect(fieldAccess('OWNER')).toMatchObject({ scanWarehouse: true, reportIncident: true });
    expect(fieldAccess('CUSTOMER')).toMatchObject({
      scanWarehouse: false,
      receiveReplacement: false,
      viewDocuments: false,
      reportIncident: true,
    });
  });
});

describe('format', () => {
  it('tanggal murni tidak bergeser zona waktu', () => {
    expect(formatDate('2026-11-08')).toBe('08/11/2026');
    expect(formatDate('2026-11-08T17:00:00.000Z')).toBe('08/11/2026');
  });
});
