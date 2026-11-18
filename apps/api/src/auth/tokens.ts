import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ROLES, type Role } from '@eventra/shared';

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;

export interface AccessClaims {
  sub: string;
  role: Role;
  /** Hanya token portal pelanggan: id pesanan satu-satunya yang boleh diakses. */
  ord?: string;
}

export const PORTAL_TTL_SECONDS = 12 * 60 * 60;

export function signAccessToken(
  secret: string,
  claims: AccessClaims,
  ttlSeconds = ACCESS_TTL_SECONDS,
): string {
  return jwt.sign(
    claims.ord ? { role: claims.role, ord: claims.ord } : { role: claims.role },
    secret,
    {
      subject: claims.sub,
      expiresIn: ttlSeconds,
      algorithm: 'HS256',
    },
  );
}

/** Mengembalikan claim bila token valid dan belum kadaluarsa; null bila tidak. */
export function verifyAccessToken(secret: string, token: string): AccessClaims | null {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || typeof payload.sub !== 'string') return null;
    const role = payload['role'];
    if (!ROLES.includes(role as Role)) return null;
    const ord = payload['ord'];
    return {
      sub: payload.sub,
      role: role as Role,
      ...(typeof ord === 'string' ? { ord } : {}),
    };
  } catch {
    return null;
  }
}

/** Token opak acak untuk refresh/reset; hanya hash-nya yang disimpan. */
export function generateOpaqueToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
