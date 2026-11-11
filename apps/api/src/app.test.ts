import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app';

describe('API', () => {
  it('GET /health 200 saat DB up', async () => {
    const res = await request(createApp({ checkDb: async () => true })).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('GET /health 503 saat DB down', async () => {
    const res = await request(
      createApp({
        checkDb: async () => {
          throw new Error('down');
        },
      }),
    ).get('/api/v1/health');
    expect(res.status).toBe(503);
    expect(res.body.data).toMatchObject({ status: 'degraded', db: 'down' });
  });

  it('rute tak dikenal memakai format error standar', async () => {
    const res = await request(createApp({ checkDb: async () => true })).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } });
  });

  it('JSON rusak menghasilkan 400 INVALID_JSON', async () => {
    const res = await request(createApp({ checkDb: async () => true }))
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});
