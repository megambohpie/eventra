import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, db, resetDb } from '../test/helpers';

describe('API dasar', () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  it('GET /health 200 saat DB up', async () => {
    const res = await request(createTestApp().app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('GET /health 503 saat DB down', async () => {
    const { app } = createTestApp(async () => {
      throw new Error('down');
    });
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(503);
    expect(res.body.data).toMatchObject({ status: 'degraded', db: 'down' });
  });

  it('rute tak dikenal tanpa login ditolak 401, bukan membocorkan keberadaan rute', async () => {
    const res = await request(createTestApp().app).get('/api/v1/nope');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('JSON rusak menghasilkan 400 INVALID_JSON', async () => {
    const res = await request(createTestApp().app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});
