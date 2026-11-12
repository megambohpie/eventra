import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { NotificationDto, NotificationListDto } from '@eventra/shared';
import { currentUser } from '../auth/middleware';
import { HttpError } from '../errors';
import { parseId } from '../http';

/** Notifikasi dalam aplikasi milik pengguna yang login (tanpa capability khusus). */
export function notificationsRouter(db: PrismaClient): Router {
  const router = Router();

  router.get('/notifications', async (req, res) => {
    const userId = currentUser(req).id;
    const [rows, unread] = await Promise.all([
      db.notification.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }],
        take: 30,
      }),
      db.notification.count({ where: { userId, readAt: null } }),
    ]);
    const items: NotificationDto[] = rows.map((n) => ({
      id: n.id,
      type: n.type,
      entity: n.entity,
      entityId: n.entityId,
      params: n.params as Record<string, string>,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));
    const data: NotificationListDto = { items, unread };
    res.json({ data });
  });

  router.post('/notifications/read-all', async (req, res) => {
    await db.notification.updateMany({
      where: { userId: currentUser(req).id, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ data: { ok: true } });
  });

  router.post('/notifications/:id/read', async (req, res) => {
    const id = parseId(req.params.id);
    const result = await db.notification.updateMany({
      where: { id, userId: currentUser(req).id, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const exists = await db.notification.findFirst({
        where: { id, userId: currentUser(req).id },
        select: { id: true },
      });
      if (!exists) throw new HttpError(404, 'NOT_FOUND', 'Notifikasi tidak ditemukan');
    }
    res.json({ data: { ok: true } });
  });

  return router;
}
