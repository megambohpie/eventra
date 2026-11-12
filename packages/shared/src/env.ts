import { z } from 'zod';

/** Parse env dengan schema Zod; lempar error ringkas bila tidak valid. */
export function parseEnv<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined>,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Konfigurasi environment tidak valid: ${detail}`);
  }
  return result.data;
}

export const apiEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    /** Daftar origin web yang diizinkan CORS, dipisah koma. Wajib di production. */
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      ),
    /** Jumlah hop reverse proxy tepercaya (agar req.ip dan rate limit memakai IP klien). */
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (env.CORS_ORIGINS.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'wajib diisi (origin web) di production',
      });
    }
    if (env.CORS_ORIGINS.includes('*')) {
      ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'tidak boleh wildcard' });
    }
    if (env.JWT_SECRET.startsWith('ganti-dengan')) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'masih memakai nilai contoh .env.example',
      });
    }
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;
