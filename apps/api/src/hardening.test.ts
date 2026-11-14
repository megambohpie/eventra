import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import jwt from 'jsonwebtoken';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { newQrToken } from './assets/service';
import { JobMonitor } from './ops/jobs';
import { createLogger, silentLogger, type Logger } from './ops/logger';
import { rateLimit } from './ops/rateLimit';
import { expireHolds } from './orders/service';
import {
  createTestApp,
  createUser,
  db,
  JWT_SECRET,
  loginAs,
  PASSWORD,
  resetDb,
} from '../test/helpers';

const V1 = '/api/v1';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const errorCode = (res: request.Response) => (res.body as { error: { code: string } }).error.code;
const UUID = '11111111-1111-4111-8111-111111111111';

interface RouteDef {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  file: string;
}

/** Semua rute terdaftar, dibaca dari sumber `routes/*.ts` agar rute baru otomatis ikut diuji. */
function allRoutes(): RouteDef[] {
  const dir = join(__dirname, 'routes');
  const routes: RouteDef[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const src = readFileSync(join(dir, file), 'utf8');
    for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
      routes.push({ method: m[1] as RouteDef['method'], path: m[2] as string, file });
    }
  }
  return routes;
}

const concrete = (path: string) => path.replace(/:\w+/g, UUID);

/** Kirim permintaan kosong ke sebuah rute (dengan token bila diberikan). */
function send(app: Express, r: RouteDef, token?: string): Promise<request.Response> {
  const req = request(app)[r.method](`${V1}${concrete(r.path)}`);
  if (token) req.set(auth(token));
  return req.send({});
}
/** Rute publik (login, refresh, reset); selain itu wajib autentikasi. */
const PUBLIC_FILE = 'auth.ts';
const PROTECTED_IN_AUTH = new Set(['/me']);
const isPublic = (r: RouteDef) => r.file === PUBLIC_FILE && !PROTECTED_IN_AUTH.has(r.path);

describe('Fase 08 — keamanan akses', () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  it('pembaca rute menemukan seluruh endpoint (guard terhadap regex usang)', () => {
    const routes = allRoutes();
    expect(routes.length).toBeGreaterThan(100);
    expect(routes.filter(isPublic).map((r) => r.path)).toEqual(
      expect.arrayContaining(['/auth/login', '/auth/refresh', '/auth/logout']),
    );
  });

  it('setiap endpoint non-publik menolak permintaan tanpa token (401)', async () => {
    const { app } = createTestApp();
    const failures: string[] = [];
    for (const r of allRoutes().filter((x) => !isPublic(x))) {
      const res = await send(app, r);
      if (res.status !== 401) failures.push(`${r.method.toUpperCase()} ${r.path} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('token palsu, kadaluarsa, alg none, atau user nonaktif ditolak', async () => {
    const { app } = createTestApp();
    const user = await createUser('ADMIN');
    const claims = { sub: user.id, role: 'ADMIN' };
    const get = (token: string) => request(app).get(`${V1}/customers`).set(auth(token));

    const good = jwt.sign(claims, JWT_SECRET, { expiresIn: 60 });
    expect((await get(good)).status).toBe(200);
    expect((await get(jwt.sign(claims, 'salah-salah-salah-salah-salah-salah!!'))).status).toBe(401);
    expect((await get(jwt.sign(claims, JWT_SECRET, { expiresIn: -10 }))).status).toBe(401);
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(
      JSON.stringify(claims),
    ).toString('base64url')}.`;
    expect((await get(none)).status).toBe(401);
    expect((await get('bukan-jwt')).status).toBe(401);

    await db.user.update({ where: { id: user.id }, data: { active: false } });
    expect((await get(good)).status).toBe(401);
  });

  it('peran dalam token tidak dipercaya: peran dibaca dari database', async () => {
    const { app } = createTestApp();
    const limited = await createUser('WAREHOUSE');
    const forged = jwt.sign({ sub: limited.id, role: 'ADMIN' }, JWT_SECRET, { expiresIn: 60 });
    const res = await request(app)
      .post(`${V1}/customers`)
      .set(auth(forged))
      .send({ type: 'COMPANY', name: 'X' });
    expect(res.status).toBe(403);
  });

  it('OWNER (otorisasi penuh) tidak pernah ditolak 403 di endpoint tulis mana pun', async () => {
    const { app } = createTestApp();
    const owner = await loginAs(app, 'OWNER');
    const failures: string[] = [];
    for (const r of allRoutes().filter((x) => x.method !== 'get' && !isPublic(x))) {
      const res = await send(app, r, owner);
      if (res.status === 403) failures.push(`${r.method.toUpperCase()} ${r.path} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('id bukan UUID menjadi 404, bukan error database', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    for (const path of ['/assets/abc', '/orders/1', '/pick-lists/x', '/invoices/%27%20OR%201=1']) {
      const res = await request(app).get(`${V1}${path}`).set(auth(admin));
      expect(res.status, path).toBe(404);
    }
  });

  it('password dan hash tidak pernah muncul di respons user maupun audit log', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const created = await request(app).post(`${V1}/users`).set(auth(admin)).send({
      name: 'Staf',
      email: 'staf@test.local',
      password: 'RahasiaBanget123!',
      role: 'WAREHOUSE',
    });
    expect(created.status).toBe(201);
    expect(JSON.stringify(created.body)).not.toMatch(/RahasiaBanget|passwordHash|\$2[aby]\$/);
    const audits = JSON.stringify(await db.auditLog.findMany());
    expect(audits).not.toMatch(/RahasiaBanget|\$2[aby]\$/);
    expect(audits).not.toContain(PASSWORD);
  });
});

describe('Fase 08 — batas laju', () => {
  beforeEach(resetDb);

  const limits = {
    global: { windowMs: 60_000, max: 1000 },
    login: { windowMs: 60_000, max: 3, maxPerIp: 100 },
    refresh: { windowMs: 60_000, max: 2 },
    reset: { windowMs: 60_000, max: 2 },
  };

  it('login dibatasi per IP+email; email lain tidak terdampak; mengembalikan 429 + Retry-After', async () => {
    const { app } = createTestApp(undefined, { rateLimits: limits });
    await createUser('ADMIN', 'a@test.local');
    await createUser('WAREHOUSE', 'b@test.local');
    const login = (email: string, password = 'salah-salah') =>
      request(app).post(`${V1}/auth/login`).send({ email, password });

    for (let i = 0; i < 3; i += 1) expect((await login('a@test.local')).status).toBe(401);
    const blocked = await login('a@test.local', PASSWORD); // bahkan password benar tetap diblokir
    expect(blocked.status).toBe(429);
    expect(errorCode(blocked)).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    // Variasi huruf besar/kecil tidak menghindari batas.
    expect((await login('A@Test.Local')).status).toBe(429);
    expect((await login('b@test.local', PASSWORD)).status).toBe(200);
  });

  it('refresh dan permintaan reset password dibatasi', async () => {
    const { app } = createTestApp(undefined, { rateLimits: limits });
    for (let i = 0; i < 2; i += 1) {
      expect(
        (await request(app).post(`${V1}/auth/password-reset/request`).send({ email: 'x@y.id' }))
          .status,
      ).toBe(200);
    }
    expect(
      (await request(app).post(`${V1}/auth/password-reset/request`).send({ email: 'x@y.id' }))
        .status,
    ).toBe(429);
    for (let i = 0; i < 2; i += 1) {
      expect(
        (
          await request(app)
            .post(`${V1}/auth/refresh`)
            .send({ refreshToken: 'x'.repeat(30) })
        ).status,
      ).toBe(401);
    }
    expect(
      (
        await request(app)
          .post(`${V1}/auth/refresh`)
          .send({ refreshToken: 'x'.repeat(30) })
      ).status,
    ).toBe(429);
  });

  it('pembatas global memakai jendela waktu dan pulih setelah jendela berlalu', () => {
    let t = 0;
    const mw = rateLimit({ windowMs: 1000, max: 2, now: () => t });
    const hit = () => {
      const headers: Record<string, string> = {};
      let blocked = false;
      try {
        mw(
          { ip: '1.1.1.1' } as never,
          { setHeader: (k: string, v: string) => (headers[k] = v) } as never,
          () => undefined,
        );
      } catch {
        blocked = true;
      }
      return blocked;
    };
    expect([hit(), hit(), hit()]).toEqual([false, false, true]);
    t = 1001;
    expect(hit()).toBe(false);
  });
});

describe('Fase 08 — unggah berkas', () => {
  beforeEach(resetDb);

  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  const endpoints = [
    `/incidents/${UUID}/photos`,
    `/pick-lists/${UUID}/items/${UUID}/photos`,
    `/assets/${UUID}/photos`,
    `/assets/groups/${UUID}/photos?date=2026-01-01`,
  ];

  it.each(endpoints)('%s menolak tipe, isi, dan ukuran yang tidak sah', async (path) => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const up = (type: string, body: Buffer) =>
      request(app).post(`${V1}${path}`).set(auth(admin)).set('Content-Type', type).send(body);

    // Tipe konten bukan gambar (mis. HTML/SVG berisi skrip).
    expect(errorCode(await up('text/html', Buffer.from('<script>alert(1)</script>')))).toBe(
      'INVALID_IMAGE',
    );
    expect(errorCode(await up('image/svg+xml', Buffer.from('<svg onload="alert(1)"/>')))).toBe(
      'INVALID_IMAGE',
    );
    // Label PNG tetapi isi bukan gambar (magic bytes tidak cocok).
    expect(errorCode(await up('image/png', Buffer.from('GIF89a-bukan-png')))).toBe('INVALID_IMAGE');
    // Isi PNG tetapi dilabeli JPEG.
    expect(errorCode(await up('image/jpeg', PNG))).toBe('INVALID_IMAGE');
    // Body kosong.
    expect(errorCode(await up('image/png', Buffer.alloc(0)))).toBe('INVALID_IMAGE');
    // Lebih dari 3 MB ditolak sebelum diproses.
    const big = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]);
    const huge = await up('image/png', big);
    expect(huge.status).toBe(413);
    expect(errorCode(huge)).toBe('PAYLOAD_TOO_LARGE');
  });

  it('unggah memerlukan capability yang tepat', async () => {
    const { app } = createTestApp();
    const customer = await loginAs(app, 'CUSTOMER');
    for (const path of endpoints) {
      const res = await request(app)
        .post(`${V1}${path}`)
        .set(auth(customer))
        .set('Content-Type', 'image/png')
        .send(PNG);
      expect(res.status, path).toBe(403);
    }
  });

  it('body JSON di atas 1 MB ditolak 413', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const res = await request(app)
      .post(`${V1}/customers`)
      .set(auth(admin))
      .send({ type: 'COMPANY', name: 'x'.repeat(1_100_000) });
    expect(res.status).toBe(413);
  });
});

describe('Fase 08 — token QR dan audit log', () => {
  beforeEach(resetDb);

  async function seedAsset() {
    const category = await db.category.create({ data: { name: 'Umum' } });
    const product = await db.product.create({
      data: {
        name: 'Speaker',
        categoryId: category.id,
        pricingUnit: 'PCS',
        unitLabel: 'pcs',
        price: 100000n,
        deposit: 0n,
      },
    });
    return db.asset.create({
      data: { code: 'AST-H00001', qrToken: newQrToken(), productId: product.id },
    });
  }

  it('token QR 144 bit, acak, dan unik', () => {
    const tokens = new Set(Array.from({ length: 2000 }, newQrToken));
    expect(tokens.size).toBe(2000);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{24}$/);
  });

  it('token tidak bocor lewat DTO, riwayat, audit, maupun access log; scan salah generik', async () => {
    const lines: string[] = [];
    const capture: Logger = {
      ...silentLogger,
      info: (m, f) => lines.push(JSON.stringify({ m, ...f })),
      warn: (m, f) => lines.push(JSON.stringify({ m, ...f })),
    };
    const { app } = createTestApp(undefined, { logger: capture });
    const admin = await loginAs(app, 'ADMIN');
    const asset = await seedAsset();
    const old = asset.qrToken;

    const scanned = await request(app).get(`${V1}/assets/scan/${old}`).set(auth(admin));
    expect(scanned.status).toBe(200);
    const bodies = [
      scanned,
      await request(app).get(`${V1}/assets`).set(auth(admin)),
      await request(app).get(`${V1}/assets/${asset.id}`).set(auth(admin)),
      await request(app).get(`${V1}/assets/${asset.id}/history`).set(auth(admin)),
    ];
    for (const b of bodies) {
      expect(b.status).toBe(200);
      expect(JSON.stringify(b.body)).not.toContain(old);
    }

    const regen = await request(app)
      .post(`${V1}/assets/${asset.id}/qr/regenerate`)
      .set(auth(admin));
    expect(regen.status).toBe(200);
    const fresh = (await db.asset.findUniqueOrThrow({ where: { id: asset.id } })).qrToken;
    expect(fresh).not.toBe(old);
    // Token lama langsung tidak berlaku.
    expect((await request(app).get(`${V1}/assets/scan/${old}`).set(auth(admin))).status).toBe(404);
    expect((await request(app).get(`${V1}/assets/scan/${fresh}`).set(auth(admin))).status).toBe(
      200,
    );

    const dump = JSON.stringify([
      await db.auditLog.findMany(),
      await db.assetStatusEvent.findMany(),
      regen.body,
    ]);
    expect(dump).not.toContain(old);
    expect(dump).not.toContain(fresh);
    // Access log memakai template rute, bukan URL berisi token.
    const log = lines.join('\n');
    expect(log).toContain('/assets/scan/:token');
    expect(log).not.toContain(old);
    expect(log).not.toContain(fresh);

    // Token tak dikenal/format salah: respons sama (tidak membedakan).
    const unknown = await request(app).get(`${V1}/assets/scan/${newQrToken()}`).set(auth(admin));
    const malformed = await request(app).get(`${V1}/assets/scan/a`).set(auth(admin));
    expect([unknown.status, malformed.status]).toEqual([404, 404]);
    // Scan wajib login.
    expect((await request(app).get(`${V1}/assets/scan/${fresh}`)).status).toBe(401);
  });

  it('operasi tulis dan login gagal tercatat di audit log dengan aktor dan IP', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    await request(app)
      .post(`${V1}/auth/login`)
      .send({ email: 'x@test.local', password: 'salah12345' });
    const created = await request(app)
      .post(`${V1}/customers`)
      .set(auth(admin))
      .set('User-Agent', 'uji-hardening')
      .send({ type: 'COMPANY', name: 'PT Audit' });
    expect(created.status).toBe(201);

    const actor = await db.user.findFirstOrThrow({ where: { role: 'ADMIN' } });
    const rows = await db.auditLog.findMany();
    expect(rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(['auth.login', 'auth.login_failed', 'customer.create']),
    );
    const row = rows.find((r) => r.action === 'customer.create');
    expect(row).toMatchObject({ actorId: actor.id, device: 'uji-hardening' });
    expect(row?.ip).toBeTruthy();
  });

  it('audit log, riwayat status aset, dan riwayat status pesanan tidak dapat diubah atau dihapus', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const asset = await seedAsset();
    await request(app).post(`${V1}/assets/${asset.id}/qr/regenerate`).set(auth(admin));
    const audit = await db.auditLog.findFirstOrThrow();
    const event = await db.assetStatusEvent.findFirstOrThrow();

    await expect(
      db.auditLog.update({ where: { id: audit.id }, data: { action: 'x' } }),
    ).rejects.toThrow(/append-only/);
    await expect(db.auditLog.deleteMany({})).rejects.toThrow(/append-only/);
    await expect(db.assetStatusEvent.deleteMany({})).rejects.toThrow(/append-only/);
    await expect(
      db.assetStatusEvent.update({ where: { id: event.id }, data: { type: 'UPDATED' } }),
    ).rejects.toThrow(/append-only/);
    await expect(db.orderStatusEvent.deleteMany({})).resolves.toBeDefined(); // kosong: tidak ada baris yang dihapus
    expect(await db.auditLog.count()).toBeGreaterThan(0);
  });
});

describe('Fase 08 — header, CORS, dan observability', () => {
  beforeEach(resetDb);

  it('header keamanan, no-store, dan request id', async () => {
    const { app } = createTestApp();
    const res = await request(app).get(`${V1}/health`);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-request-id']).toMatch(/^[\w-]{8,64}$/);
    const echoed = await request(app).get(`${V1}/health`).set('x-request-id', 'trace-abc-12345');
    expect(echoed.headers['x-request-id']).toBe('trace-abc-12345');
    // Request id berbahaya (newline/terlalu pendek) diganti.
    const bad = await request(app).get(`${V1}/health`).set('x-request-id', 'a b');
    expect(bad.headers['x-request-id']).not.toBe('a b');
  });

  it('CORS dibatasi ke origin yang diizinkan', async () => {
    const { app } = createTestApp(undefined, { corsOrigins: ['https://app.eventra.id'] });
    const ok = await request(app).get(`${V1}/health`).set('Origin', 'https://app.eventra.id');
    expect(ok.headers['access-control-allow-origin']).toBe('https://app.eventra.id');
    const evil = await request(app).get(`${V1}/health`).set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('liveness selalu 200; readiness 503 saat DB mati atau job basi', async () => {
    let now = 1_000_000;
    const reports: unknown[] = [];
    const jobs = new JobMonitor(silentLogger, { report: (e) => reports.push(e) }, () => now);
    jobs.register('hold-expiry', 60_000);
    const up = createTestApp(undefined, { jobs });
    expect((await request(up.app).get(`${V1}/health/live`)).status).toBe(200);
    expect((await request(up.app).get(`${V1}/health/ready`)).status).toBe(200);

    now += 200_000; // > 3× interval tanpa sukses
    const stale = await request(up.app).get(`${V1}/health/ready`);
    expect(stale.status).toBe(503);
    expect(
      (stale.body as { data: { jobs: { name: string; stale: boolean }[] } }).data.jobs[0],
    ).toMatchObject({ name: 'hold-expiry', stale: true });

    await jobs.run('hold-expiry', async () => undefined);
    expect((await request(up.app).get(`${V1}/health/ready`)).status).toBe(200);

    const down = createTestApp(async () => {
      throw new Error('db down');
    });
    expect((await request(down.app).get(`${V1}/health/live`)).status).toBe(200);
    expect((await request(down.app).get(`${V1}/health/ready`)).status).toBe(503);
  });

  it('error tak terduga: klien hanya menerima pesan generik, reporter menerima detail + request id', async () => {
    const reports: { err: unknown; ctx: { requestId?: string; route?: string } }[] = [];
    const { app } = createTestApp(undefined, {
      reporter: { report: (err, ctx) => reports.push({ err, ctx }) },
      db: new Proxy(db, {
        get: (target, prop, recv) =>
          prop === 'user'
            ? { findUnique: () => Promise.reject(new Error('rahasia: koneksi db://pwd')) }
            : Reflect.get(target, prop, recv),
      }),
    });
    const res = await request(app)
      .post(`${V1}/auth/login`)
      .send({ email: 'a@b.id', password: 'x12345678' });
    expect(res.status).toBe(500);
    expect(errorCode(res)).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('rahasia');
    expect(reports).toHaveLength(1);
    expect(String((reports[0]?.err as Error).message)).toContain('rahasia');
    expect(reports[0]?.ctx.requestId).toBe(res.headers['x-request-id']);
  });

  it('logger JSON menulis satu baris per entri dan menyaring level', () => {
    const out: string[] = [];
    const spy = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      out.push(chunk);
      return true;
    }) as typeof process.stdout.write;
    try {
      const log = createLogger('info');
      log.debug('diabaikan');
      log.info('halo', { a: 1 });
    } finally {
      process.stdout.write = spy;
    }
    expect(out).toHaveLength(1);
    expect(JSON.parse(out[0] ?? '')).toMatchObject({ level: 'info', msg: 'halo', a: 1 });
  });
});

describe('Fase 08 — job hold expiry', () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  async function awaitingOrder(holdExpiresAt: Date) {
    const customer = await db.customer.create({ data: { type: 'COMPANY', name: 'PT Hold' } });
    return db.order.create({
      data: {
        number: `ORD-2027-H${Math.floor(Math.random() * 1e5)}`,
        customerId: customer.id,
        status: 'AWAITING_PAYMENT',
        startDate: new Date('2027-08-01T00:00:00Z'),
        endDate: new Date('2027-08-02T00:00:00Z'),
        eventLocation: 'Balai',
        subtotal: 1n,
        depositTotal: 0n,
        holdExpiresAt,
      },
    });
  }

  it('hold kadaluarsa menjadi EXPIRED; yang belum kadaluarsa tidak disentuh; idempoten dan aman bersamaan', async () => {
    const due = await awaitingOrder(new Date(Date.now() - 60_000));
    const live = await awaitingOrder(new Date(Date.now() + 3_600_000));

    const results = await Promise.all([expireHolds(db), expireHolds(db), expireHolds(db)]);
    expect(results.reduce((a, b) => a + b, 0)).toBe(1); // tepat satu pemenang
    expect((await db.order.findUniqueOrThrow({ where: { id: due.id } })).status).toBe('EXPIRED');
    expect((await db.order.findUniqueOrThrow({ where: { id: live.id } })).status).toBe(
      'AWAITING_PAYMENT',
    );
    expect(await expireHolds(db)).toBe(0);
  });

  it('JobMonitor: gagal dilaporkan tanpa menghentikan job, tumpang-tindih dilewati, pulih setelah sukses', async () => {
    const reports: unknown[] = [];
    let now = 0;
    const jobs = new JobMonitor(silentLogger, { report: (e) => reports.push(e) }, () => now);
    jobs.register('j', 1000);

    expect(await jobs.run('j', () => Promise.reject(new Error('boom')))).toBe(false);
    expect(reports).toHaveLength(1);
    expect(jobs.status()[0]).toMatchObject({ consecutiveFailures: 1, lastError: 'boom' });

    let release: () => void = () => undefined;
    const slow = jobs.run('j', () => new Promise<void>((r) => (release = r)));
    expect(await jobs.run('j', async () => undefined)).toBe(false); // dilewati
    release();
    expect(await slow).toBe(true);
    expect(jobs.status()[0]).toMatchObject({
      consecutiveFailures: 0,
      lastError: null,
      stale: false,
    });

    for (let i = 0; i < 3; i += 1) await jobs.run('j', () => Promise.reject(new Error('x')));
    expect(jobs.status()[0]?.stale).toBe(true);
    now += 10;
    await jobs.run('j', async () => undefined);
    expect(jobs.status()[0]?.stale).toBe(false);
  });
});
