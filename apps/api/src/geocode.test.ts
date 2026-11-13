import { afterEach, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import request from 'supertest';
import { createTestApp, db, loginAs, resetDb } from '../test/helpers';

describe('pencarian lokasi (proxy geocoding)', () => {
  beforeEach(resetDb);
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => db.$disconnect());

  it('mengembalikan hasil terformat tanpa meneruskan token pengguna', async () => {
    const getMock = vi.spyOn(axios, 'get').mockResolvedValue({
      data: [
        { lat: '-6.2297465', lon: '106.8261', display_name: 'Balai Kartini, Jakarta' },
        { lat: 'x', lon: 'y', display_name: 'rusak' },
      ],
    });
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');

    const res = await request(app)
      .get('/api/v1/geocode/search?q=balai%20kartini')
      .set('Authorization', `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { lat: -6.229746, lng: 106.8261, label: 'Balai Kartini, Jakarta' },
    ]);
    const [, config] = getMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(Object.keys(config.headers)).toEqual(['User-Agent']);
  });

  it('menolak query pendek, tanpa izin order.write, dan melaporkan layanan mati', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const warehouse = await loginAs(app, 'WAREHOUSE');
    const get = (token: string, q: string) =>
      request(app).get(`/api/v1/geocode/search?q=${q}`).set('Authorization', `Bearer ${token}`);

    expect((await get(admin, 'ab')).status).toBe(400);
    expect((await get(warehouse, 'balai')).status).toBe(403);

    vi.spyOn(axios, 'get').mockRejectedValue(new Error('down'));
    const down = await get(admin, 'balai');
    expect(down.status).toBe(502);
    expect(down.body.error.code).toBe('GEOCODE_UNAVAILABLE');
  });
});
