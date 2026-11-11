import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PASSWORD, createTestApp, createUser, db, resetDb } from '../test/helpers';

const login = (app: ReturnType<typeof createTestApp>['app'], email: string, password = PASSWORD) =>
  request(app).post('/api/v1/auth/login').send({ email, password });

describe('Auth', () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  it('login berhasil mengembalikan token dan user tanpa password hash', async () => {
    const { app } = createTestApp();
    const user = await createUser('ADMIN');
    const res = await login(app, user.email);
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({ email: user.email, role: 'ADMIN' });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    // Hanya hash refresh token yang disimpan.
    const stored = await db.refreshToken.findFirstOrThrow();
    expect(stored.tokenHash).not.toBe(res.body.data.refreshToken);
  });

  it('password salah, email tak dikenal, dan user nonaktif sama-sama 401', async () => {
    const { app } = createTestApp();
    const user = await createUser('ADMIN');
    const inactive = await createUser('WAREHOUSE');
    await db.user.update({ where: { id: inactive.id }, data: { active: false } });
    for (const res of [
      await login(app, user.email, 'salah-salah'),
      await login(app, 'nobody@test.local'),
      await login(app, inactive.email),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    }
    expect(await db.auditLog.count({ where: { action: 'auth.login_failed' } })).toBe(3);
  });

  it('/me butuh access token valid', async () => {
    const { app } = createTestApp();
    const user = await createUser('ADMIN');
    expect((await request(app).get('/api/v1/me')).status).toBe(401);
    expect((await request(app).get('/api/v1/me').set('Authorization', 'Bearer rusak')).status).toBe(
      401,
    );
    const session = (await login(app, user.email)).body.data;
    const me = await request(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(user.email);
  });

  it('user yang dinonaktifkan langsung kehilangan akses walau token masih berlaku', async () => {
    const { app } = createTestApp();
    const user = await createUser('ADMIN');
    const { accessToken } = (await login(app, user.email)).body.data;
    await db.user.update({ where: { id: user.id }, data: { active: false } });
    const res = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(401);
  });

  it('refresh memutar token; token lama yang dipakai ulang mencabut seluruh sesi', async () => {
    const { app } = createTestApp();
    const user = await createUser('ADMIN');
    const first = (await login(app, user.email)).body.data;
    const second = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken });
    expect(second.status).toBe(200);
    expect(second.body.data.refreshToken).not.toBe(first.refreshToken);

    const replay = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken });
    expect(replay.status).toBe(401);
    // Token baru ikut dicabut oleh deteksi pemakaian ulang.
    const afterReplay = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: second.body.data.refreshToken });
    expect(afterReplay.status).toBe(401);
  });

  it('logout mencabut refresh token', async () => {
    const { app } = createTestApp();
    const user = await createUser('ADMIN');
    const session = (await login(app, user.email)).body.data;
    const out = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: session.refreshToken });
    expect(out.status).toBe(200);
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken });
    expect(res.status).toBe(401);
  });

  it('reset password: token sekali pakai, password berubah, sesi lama dicabut', async () => {
    const { app, sentResets } = createTestApp();
    const user = await createUser('ADMIN');
    const session = (await login(app, user.email)).body.data;

    const req1 = await request(app)
      .post('/api/v1/auth/password-reset/request')
      .send({ email: user.email });
    expect(req1.status).toBe(200);
    expect(sentResets).toHaveLength(1);
    const token = sentResets[0]!.token;

    const newPassword = 'PasswordBaru456!';
    const confirm = await request(app)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, password: newPassword });
    expect(confirm.status).toBe(200);
    expect((await login(app, user.email)).status).toBe(401);
    expect((await login(app, user.email, newPassword)).status).toBe(200);

    const reuse = await request(app)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, password: 'LainLagi789!' });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe('INVALID_RESET_TOKEN');

    const oldSession = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken });
    expect(oldSession.status).toBe(401);
  });

  it('request reset untuk email tak dikenal tetap 200 tanpa mengirim apa pun', async () => {
    const { app, sentResets } = createTestApp();
    const res = await request(app)
      .post('/api/v1/auth/password-reset/request')
      .send({ email: 'x@test.local' });
    expect(res.status).toBe(200);
    expect(sentResets).toHaveLength(0);
  });

  it('reset menolak token palsu dan password pendek', async () => {
    const { app } = createTestApp();
    const bad = await request(app)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: 'palsu', password: 'PasswordBaru456!' });
    expect(bad.status).toBe(400);
    const short = await request(app)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: 'palsu', password: 'pendek' });
    expect(short.status).toBe(400);
    expect(short.body.error.code).toBe('VALIDATION_ERROR');
  });
});
