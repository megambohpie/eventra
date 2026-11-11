import { Router } from 'express';
import type { PrismaClient, User } from '@prisma/client';
import {
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  refreshSchema,
  type AuthSession,
  type UserDto,
} from '@eventra/shared';
import { writeAudit } from '../audit';
import { authenticate, currentUser } from '../auth/middleware';
import { hashPassword, verifyPassword } from '../auth/password';
import {
  REFRESH_TTL_MS,
  RESET_TTL_MS,
  generateOpaqueToken,
  hashToken,
  signAccessToken,
} from '../auth/tokens';
import { HttpError } from '../errors';

/** Pengiriman token reset ke pengguna (email/WhatsApp). Implementasi nyata menyusul di fase rilis. */
export interface Mailer {
  sendPasswordReset(to: { email: string; name: string }, token: string): Promise<void>;
}

export const toUserDto = (u: User): UserDto => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  role: u.role,
  active: u.active,
});

export function authRouter(db: PrismaClient, jwtSecret: string, mailer: Mailer): Router {
  const router = Router();

  async function issueSession(user: User): Promise<AuthSession> {
    const refresh = generateOpaqueToken();
    await db.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refresh.hash,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    return {
      accessToken: signAccessToken(jwtSecret, { sub: user.id, role: user.role }),
      refreshToken: refresh.token,
      user: toUserDto(user),
    };
  }

  router.post('/auth/login', async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await db.user.findUnique({ where: { email } });
    const ok = await verifyPassword(password, user?.passwordHash);
    if (!user || !ok || !user.active) {
      await writeAudit(db, req, { action: 'auth.login_failed', entity: 'user', after: { email } });
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email atau password salah');
    }
    const session = await issueSession(user);
    await writeAudit(db, req, {
      action: 'auth.login',
      entity: 'user',
      entityId: user.id,
      actorId: user.id,
    });
    res.json({ data: session });
  });

  // Rotasi refresh token; pemakaian ulang token yang sudah dicabut mencabut seluruh sesi user.
  router.post('/auth/refresh', async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    const stored = await db.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    });
    const invalid = () => new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Sesi tidak valid');
    if (!stored) throw invalid();
    if (stored.revokedAt) {
      await db.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw invalid();
    }
    if (stored.expiresAt <= new Date() || !stored.user.active) throw invalid();
    // Klaim atomik: hanya satu request konkuren yang boleh memutar token ini.
    const claimed = await db.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) throw invalid();
    res.json({ data: await issueSession(stored.user) });
  });

  router.post('/auth/logout', async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    await db.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    res.json({ data: { ok: true } });
  });

  // Selalu 200 agar tidak membocorkan email mana yang terdaftar.
  router.post('/auth/password-reset/request', async (req, res) => {
    const { email } = passwordResetRequestSchema.parse(req.body);
    const user = await db.user.findUnique({ where: { email } });
    if (user?.active) {
      const reset = generateOpaqueToken();
      await db.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: reset.hash,
          expiresAt: new Date(Date.now() + RESET_TTL_MS),
        },
      });
      await writeAudit(db, req, {
        action: 'auth.password_reset_requested',
        entity: 'user',
        entityId: user.id,
        actorId: user.id,
      });
      await mailer.sendPasswordReset({ email: user.email, name: user.name }, reset.token);
    }
    res.json({ data: { ok: true } });
  });

  router.post('/auth/password-reset/confirm', async (req, res) => {
    const { token, password } = passwordResetConfirmSchema.parse(req.body);
    const stored = await db.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    const invalid = () =>
      new HttpError(400, 'INVALID_RESET_TOKEN', 'Token reset tidak valid atau kadaluarsa');
    if (!stored || stored.usedAt || stored.expiresAt <= new Date()) throw invalid();
    const passwordHash = await hashPassword(password);
    await db.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: stored.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw invalid();
      await tx.user.update({ where: { id: stored.userId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await writeAudit(tx, req, {
        action: 'auth.password_reset',
        entity: 'user',
        entityId: stored.userId,
        actorId: stored.userId,
      });
    });
    res.json({ data: { ok: true } });
  });

  router.get('/me', authenticate(db, jwtSecret), async (req, res) => {
    const user = await db.user.findUniqueOrThrow({ where: { id: currentUser(req).id } });
    res.json({ data: toUserDto(user) });
  });

  return router;
}
