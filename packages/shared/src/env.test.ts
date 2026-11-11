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
});
