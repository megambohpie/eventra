import { describe, expect, it } from 'vitest';
import { apiEnvSchema, parseEnv } from './env';

describe('parseEnv', () => {
  it('menerapkan default dan coerce PORT', () => {
    const env = parseEnv(apiEnvSchema, { DATABASE_URL: 'postgresql://x', PORT: '4000' });
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
  });
  it('menolak bila DATABASE_URL hilang', () => {
    expect(() => parseEnv(apiEnvSchema, {})).toThrow(/DATABASE_URL/);
  });
});
