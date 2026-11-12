import { describe, expect, it } from 'vitest';
import type {
  AuthSession,
  IncidentSummaryDto,
  PickListSummaryDto,
  ReplacementTaskDto,
} from '@eventra/shared';
import { base64ToArrayBuffer, toPickedPhoto } from './photos';
import { createScanGate, parseAssetCode, parseQrToken } from './qr';
import { createSessionStore, type KeyValueStorage } from './session';
import { canPop, initialNav, navReducer } from './navigation';
import { buildTasks, mobileAccess, taskSourcesFor } from './tasks';
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

describe('photos', () => {
  const b64 = (bytes: number[]) => Buffer.from(bytes).toString('base64');

  it('mendekode base64 (dengan/tanpa data URL) sama dengan Buffer', () => {
    for (const bytes of [[1], [1, 2], [1, 2, 3], [255, 0, 128, 7, 9]]) {
      const out = new Uint8Array(base64ToArrayBuffer(b64(bytes)));
      expect([...out]).toEqual(bytes);
    }
    const withPrefix = new Uint8Array(base64ToArrayBuffer(`data:image/png;base64,${b64([9, 8])}`));
    expect([...withPrefix]).toEqual([9, 8]);
  });

  it('menolak karakter base64 tidak valid', () => {
    expect(() => base64ToArrayBuffer('@@@@')).toThrow();
  });

  it('memvalidasi tipe, kosong, dan ukuran seperti backend', () => {
    const ok = toPickedPhoto({ uri: 'f.jpg', mimeType: 'image/jpeg', base64: b64([1, 2, 3]) });
    expect('photo' in ok && ok.photo.data.byteLength).toBe(3);
    expect(toPickedPhoto({ uri: 'f.heic', mimeType: 'image/heic', base64: b64([1]) })).toEqual({
      error: 'TYPE',
    });
    expect(toPickedPhoto({ uri: 'f.jpg', base64: null })).toEqual({ error: 'EMPTY' });
    const big = Buffer.alloc(3 * 1024 * 1024 + 1, 1).toString('base64');
    expect(toPickedPhoto({ uri: 'f.jpg', mimeType: 'image/jpeg', base64: big })).toEqual({
      error: 'SIZE',
    });
  });

  it('menebak PNG dari ekstensi bila mimeType tidak tersedia', () => {
    const r = toPickedPhoto({ uri: 'x.png', base64: b64([1]) });
    expect('photo' in r && r.photo.mimeType).toBe('image/png');
  });
});

describe('session store', () => {
  const memory = (): KeyValueStorage & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return {
      data,
      getItem: async (k) => data.get(k) ?? null,
      setItem: async (k, v) => void data.set(k, v),
      removeItem: async (k) => void data.delete(k),
    };
  };
  const session: AuthSession = {
    accessToken: 'access',
    refreshToken: 'refresh',
    user: {
      id: 'u1',
      name: 'Gudang',
      email: 'g@example.com',
      phone: null,
      role: 'WAREHOUSE',
      active: true,
    },
  };

  it('menyimpan refresh token tanpa access token, lalu memulihkannya', async () => {
    const storage = memory();
    const store = createSessionStore(storage);
    await store.set(session);
    expect(store.get().accessToken).toBe('access');
    expect(storage.data.get('eventra.session')).not.toContain('access"');

    const restored = createSessionStore(storage);
    expect(restored.get().status).toBe('restoring');
    await restored.restore();
    expect(restored.get()).toMatchObject({
      status: 'signedIn',
      accessToken: null,
      refreshToken: 'refresh',
    });
  });

  it('clear menghapus penyimpanan dan memberi tahu pendengar', async () => {
    const storage = memory();
    const store = createSessionStore(storage);
    let notified = 0;
    store.subscribe(() => notified++);
    await store.set(session);
    await store.clear();
    expect(store.get().status).toBe('signedOut');
    expect(storage.data.size).toBe(0);
    expect(notified).toBe(2);
  });

  it('data tersimpan rusak dianggap signedOut', async () => {
    const storage = memory();
    storage.data.set('eventra.session', '{bukan json');
    const store = createSessionStore(storage);
    await store.restore();
    expect(store.get().status).toBe('signedOut');
  });

  it('kegagalan penyimpanan tidak menggagalkan login', async () => {
    const store = createSessionStore({
      getItem: async () => null,
      setItem: async () => Promise.reject(new Error('keychain')),
      removeItem: async () => undefined,
    });
    await expect(store.set(session)).resolves.toBeUndefined();
    expect(store.get().status).toBe('signedIn');
  });
});

describe('navigation', () => {
  it('push/pop/replace/tab', () => {
    let s = navReducer(initialNav, { type: 'push', route: { name: 'incidentNew' } });
    expect(canPop(s)).toBe(true);
    s = navReducer(s, { type: 'replace', route: { name: 'incident', id: 'i1' } });
    expect(s.stack).toEqual([{ name: 'incident', id: 'i1' }]);
    s = navReducer(s, { type: 'pop' });
    expect(canPop(s)).toBe(false);
    expect(navReducer(s, { type: 'pop' })).toBe(s);
    s = navReducer(
      { tab: 'tasks', stack: [{ name: 'incidentNew' }] },
      { type: 'tab', tab: 'account' },
    );
    expect(s).toEqual({ tab: 'account', stack: [] });
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
    expect(taskSourcesFor('CUSTOMER')).toEqual({
      pickLists: false,
      replacements: false,
      incidents: false,
    });
    expect(mobileAccess('WAREHOUSE')).toMatchObject({
      scanWarehouse: true,
      reportIncident: false,
      viewDocuments: true,
    });
    expect(mobileAccess('FIELD_PIC')).toMatchObject({
      scanWarehouse: false,
      reportIncident: true,
      receiveReplacement: true,
      viewDocuments: false,
    });
    expect(mobileAccess('OWNER')).toMatchObject({ scanWarehouse: false, reportIncident: false });
    expect(mobileAccess('CUSTOMER').tasks).toBe(false);
  });
});

describe('format', () => {
  it('tanggal murni tidak bergeser zona waktu', () => {
    expect(formatDate('2026-11-08')).toBe('08/11/2026');
    expect(formatDate('2026-11-08T17:00:00.000Z')).toBe('08/11/2026');
  });
});
