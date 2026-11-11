import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createUserSchema, type Page, type UserDto } from '@eventra/shared';
import { writeAudit } from '../audit';
import { requireCapability } from '../auth/middleware';
import { hashPassword } from '../auth/password';
import { parseListQuery } from '../http';
import { toUserDto } from './auth';

export function usersRouter(db: PrismaClient): Router {
  const router = Router();

  router.get('/users', requireCapability('user.read'), async (req, res) => {
    const { q, page, pageSize } = parseListQuery(req.query);
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [items, total] = await Promise.all([
      db.user.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.user.count({ where }),
    ]);
    const data: Page<UserDto> = { items: items.map(toUserDto), total, page, pageSize };
    res.json({ data });
  });

  router.post('/users', requireCapability('user.manage'), async (req, res) => {
    const { password, ...rest } = createUserSchema.parse(req.body);
    const passwordHash = await hashPassword(password);
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { ...rest, passwordHash } });
      await writeAudit(tx, req, {
        action: 'user.create',
        entity: 'user',
        entityId: created.id,
        after: created,
      });
      return created;
    });
    res.status(201).json({ data: toUserDto(user) });
  });

  return router;
}
