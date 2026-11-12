import { describe, expect, it } from 'vitest';
import { apiEnvSchema, parseEnv } from './env';

describe('parseEnv', () => {
  it('menerapkan default dan coerce PORT', () => {
    const env = parseEnv(apiEnvSchema, {
      DATABASE_URL: 'postgresql://x',
      JWT_SECRET: 'x'.repeat(32),
      PORT: '4000',
    });
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
  });
  it('menolak JWT_SECRET pendek', () => {
    expect(() => parseEnv(apiEnvSchema, { DATABASE_URL: 'x', JWT_SECRET: 'pendek' })).toThrow(
      /JWT_SECRET/,
    );
  });
  it('menolak bila DATABASE_URL hilang', () => {
    expect(() => parseEnv(apiEnvSchema, {})).toThrow(/DATABASE_URL/);
  });
  const prod = { NODE_ENV: 'production', DATABASE_URL: 'x', JWT_SECRET: 'r'.repeat(40) };
  it('production wajib CORS_ORIGINS tanpa wildcard', () => {
    expect(() => parseEnv(apiEnvSchema, prod)).toThrow(/CORS_ORIGINS/);
    expect(() => parseEnv(apiEnvSchema, { ...prod, CORS_ORIGINS: '*' })).toThrow(/wildcard/);
    const env = parseEnv(apiEnvSchema, { ...prod, CORS_ORIGINS: 'https://a.id, https://b.id' });
    expect(env.CORS_ORIGINS).toEqual(['https://a.id', 'https://b.id']);
  });
  it('production menolak JWT_SECRET contoh', () => {
    expect(() =>
      parseEnv(apiEnvSchema, {
        ...prod,
        CORS_ORIGINS: 'https://a.id',
        JWT_SECRET: 'ganti-dengan-string-acak-minimal-32-karakter',
      }),
    ).toThrow(/JWT_SECRET/);
  });
  it('default aman untuk development', () => {
    const env = parseEnv(apiEnvSchema, { DATABASE_URL: 'x', JWT_SECRET: 'x'.repeat(32) });
    expect(env).toMatchObject({ CORS_ORIGINS: [], TRUST_PROXY: 0, LOG_LEVEL: 'info' });
  });
});
