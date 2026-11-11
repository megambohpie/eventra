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

  it('memanggil onError untuk setiap error API', async () => {
    const seen: string[] = [];
    const client = createApiClient({ baseURL: 'http://x', onError: (e) => seen.push(e.code) });
    client.defaults.adapter = respond(500, { error: { code: 'INTERNAL_ERROR', message: 'x' } });
    await expect(client.get('/a')).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(seen).toEqual(['INTERNAL_ERROR']);
  });
});
