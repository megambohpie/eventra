import type { RequestHandler } from 'express';
import type { PrismaClient } from '@prisma/client';
import { hasCapability, type Capability, type Role } from '@eventra/shared';
import { HttpError } from '../errors';
import { verifyAccessToken } from './tokens';

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

/** Wajib login. Status/peran dibaca dari DB agar user nonaktif atau berubah peran langsung berlaku. */
export function authenticate(db: PrismaClient, jwtSecret: string): RequestHandler {
  return async (req, _res, next) => {
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const claims = token ? verifyAccessToken(jwtSecret, token) : null;
    if (!claims) throw new HttpError(401, 'UNAUTHENTICATED', 'Autentikasi diperlukan');
    const user = await db.user.findUnique({ where: { id: claims.sub } });
    if (!user || !user.active) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Autentikasi diperlukan');
    }
    req.user = { id: user.id, name: user.name, role: user.role };
    next();
  };
}

export function requireCapability(...capabilities: Capability[]): RequestHandler {
  return (req, _res, next) => {
    const user = req.user;
    if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Autentikasi diperlukan');
    if (!capabilities.every((c) => hasCapability(user.role, c))) {
      throw new HttpError(403, 'FORBIDDEN', 'Anda tidak memiliki izin untuk aksi ini');
    }
    next();
  };
}

export function currentUser(req: { user?: AuthUser }): AuthUser {
  if (!req.user) throw new HttpError(401, 'UNAUTHENTICATED', 'Autentikasi diperlukan');
  return req.user;
}

/** Cukup salah satu capability (mis. gudang atau pelapor insiden dapat melihat tugas penggantian). */
export function requireAnyCapability(...capabilities: Capability[]): RequestHandler {
  return (req, _res, next) => {
    const user = req.user;
    if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Autentikasi diperlukan');
    if (!capabilities.some((c) => hasCapability(user.role, c))) {
      throw new HttpError(403, 'FORBIDDEN', 'Anda tidak memiliki izin untuk aksi ini');
    }
    next();
  };
}
