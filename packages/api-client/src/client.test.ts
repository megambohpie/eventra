import { describe, expect, it } from 'vitest';
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { createApiClient } from './client';

const respond =
  (status: number, data: unknown): AxiosAdapter =>
  async (config: InternalAxiosRequestConfig) => {
    const response = { data, status, statusText: '', headers: {}, config };
    if (status < 400) return response;
    throw new AxiosError('failed', String(status), config, null, response);
  };

describe('createApiClient', () => {
  it('menyisipkan Authorization bila token ada', async () => {
    let auth: unknown;
    const client = createApiClient({ baseURL: 'http://x', getAccessToken: () => 'tok' });
    client.defaults.adapter = (config) => {
      auth = config.headers.get('Authorization');
      return respond(200, {})(config);
    };
    await client.get('/a');
    expect(auth).toBe('Bearer tok');
  });

  it('memetakan error API terstruktur dan memanggil onUnauthorized pada 401', async () => {
    let unauthorized = false;
    const client = createApiClient({
      baseURL: 'http://x',
      onUnauthorized: () => (unauthorized = true),
    });
    client.defaults.adapter = respond(401, {
      error: { code: 'UNAUTHENTICATED', message: 'Masuk dulu' },
    });
    await expect(client.get('/a')).rejects.toMatchObject({
      name: 'ApiRequestError',
      code: 'UNAUTHENTICATED',
      status: 401,
    });
    expect(unauthorized).toBe(true);
  });

  it('401 memicu refresh sekali bersama lalu mengulang request dengan token baru', async () => {
    let refreshCalls = 0;
    let token = 'lama';
    const client = createApiClient({
      baseURL: 'http://x',
      getAccessToken: () => token,
      refreshSession: async () => {
        refreshCalls++;
        token = 'baru';
        return token;
      },
    });
    client.defaults.adapter = (config) =>
      respond(config.headers.get('Authorization') === 'Bearer baru' ? 200 : 401, {
        error: { code: 'UNAUTHENTICATED', message: 'x' },
      })(config);
    const [a, b] = await Promise.all([client.get('/a'), client.get('/b')]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(refreshCalls).toBe(1);
  });

  it('refresh gagal memanggil onUnauthorized dan melempar error', async () => {
    let unauthorized = 0;
    const client = createApiClient({
      baseURL: 'http://x',
      refreshSession: async () => null,
      onUnauthorized: () => unauthorized++,
    });
    client.defaults.adapter = respond(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } });
    await expect(client.get('/a')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(unauthorized).toBe(1);
  });

  it('401 pada /auth/* (mis. login salah) tidak memicu refresh maupun onUnauthorized', async () => {
    let refreshed = false;
    let unauthorized = false;
    const client = createApiClient({
      baseURL: 'http://x',
      refreshSession: async () => {
        refreshed = true;
        return 'x';
      },
      onUnauthorized: () => {
        unauthorized = true;
      },
    });
    client.defaults.adapter = respond(401, {
      error: { code: 'INVALID_CREDENTIALS', message: 'x' },
    });
    await expect(client.post('/auth/login', {})).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(refreshed).toBe(false);
    expect(unauthorized).toBe(false);
  });

  it('memanggil onError untuk setiap error API', async () => {
    const seen: string[] = [];
    const client = createApiClient({ baseURL: 'http://x', onError: (e) => seen.push(e.code) });
    client.defaults.adapter = respond(500, { error: { code: 'INTERNAL_ERROR', message: 'x' } });
    await expect(client.get('/a')).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(seen).toEqual(['INTERNAL_ERROR']);
  });
});
