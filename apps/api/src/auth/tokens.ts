import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ROLES, type Role } from '@eventra/shared';

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;

export interface AccessClaims {
  sub: string;
  role: Role;
}

export function signAccessToken(secret: string, claims: AccessClaims): string {
  return jwt.sign({ role: claims.role }, secret, {
    subject: claims.sub,
    expiresIn: ACCESS_TTL_SECONDS,
    algorithm: 'HS256',
  });
}

/** Mengembalikan claim bila token valid dan belum kadaluarsa; null bila tidak. */
export function verifyAccessToken(secret: string, token: string): AccessClaims | null {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || typeof payload.sub !== 'string') return null;
    const role = payload['role'];
    if (!ROLES.includes(role as Role)) return null;
    return { sub: payload.sub, role: role as Role };
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
