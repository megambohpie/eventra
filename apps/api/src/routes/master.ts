import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import {
  categoryInputSchema,
  locationInputSchema,
  type CategoryDto,
  type LocationDto,
} from '@eventra/shared';
import { writeAudit } from '../audit';
import { requireCapability } from '../auth/middleware';
import { HttpError } from '../errors';
import { parseId } from '../http';

/** Kategori dan lokasi: daftar kecil, dikembalikan utuh tanpa paginasi. */
export function masterRouter(db: PrismaClient): Router {
  const router = Router();

  router.get('/categories', requireCapability('master.read'), async (_req, res) => {
    const items = await db.category.findMany({ orderBy: { name: 'asc' } });
    const data: CategoryDto[] = items.map(({ id, name }) => ({ id, name }));
    res.json({ data });
  });

  router.post('/categories', requireCapability('master.write'), async (req, res) => {
    const input = categoryInputSchema.parse(req.body);
    const created = await db.$transaction(async (tx) => {
      const category = await tx.category.create({ data: input });
      await writeAudit(tx, req, {
        action: 'category.create',
        entity: 'category',
        entityId: category.id,
        after: category,
      });
      return category;
    });
    res.status(201).json({ data: { id: created.id, name: created.name } satisfies CategoryDto });
  });

  router.put('/categories/:id', requireCapability('master.write'), async (req, res) => {
    const id = parseId(req.params.id);
    const input = categoryInputSchema.parse(req.body);
    const updated = await db.$transaction(async (tx) => {
      const before = await tx.category.findUnique({ where: { id } });
      if (!before) throw new HttpError(404, 'NOT_FOUND', 'Kategori tidak ditemukan');
      const category = await tx.category.update({ where: { id }, data: input });
      await writeAudit(tx, req, {
        action: 'category.update',
        entity: 'category',
        entityId: id,
        before,
        after: category,
      });
      return category;
    });
    res.json({ data: { id: updated.id, name: updated.name } satisfies CategoryDto });
  });

  router.delete('/categories/:id', requireCapability('master.write'), async (req, res) => {
    const id = parseId(req.params.id);
    await db.$transaction(async (tx) => {
      const before = await tx.category.findUnique({ where: { id } });
      if (!before) throw new HttpError(404, 'NOT_FOUND', 'Kategori tidak ditemukan');
      if ((await tx.product.count({ where: { categoryId: id } })) > 0) {
        throw new HttpError(409, 'CATEGORY_IN_USE', 'Kategori masih dipakai produk');
      }
      await tx.category.delete({ where: { id } });
      await writeAudit(tx, req, {
        action: 'category.delete',
        entity: 'category',
        entityId: id,
        before,
      });
    });
    res.json({ data: { ok: true } });
  });

  router.get('/locations', requireCapability('master.read'), async (_req, res) => {
    const items = await db.location.findMany({ orderBy: { name: 'asc' } });
    const data: LocationDto[] = items.map(({ id, name, address, active }) => ({
      id,
      name,
      address,
      active,
    }));
    res.json({ data });
  });

  router.post('/locations', requireCapability('master.write'), async (req, res) => {
    const input = locationInputSchema.parse(req.body);
    const created = await db.$transaction(async (tx) => {
      const location = await tx.location.create({
        data: { ...input, active: input.active ?? true },
      });
      await writeAudit(tx, req, {
        action: 'location.create',
        entity: 'location',
        entityId: location.id,
        after: location,
      });
      return location;
    });
    res.status(201).json({
      data: {
        id: created.id,
        name: created.name,
        address: created.address,
        active: created.active,
      } satisfies LocationDto,
    });
  });

  router.put('/locations/:id', requireCapability('master.write'), async (req, res) => {
    const id = parseId(req.params.id);
    const input = locationInputSchema.parse(req.body);
    const updated = await db.$transaction(async (tx) => {
      const before = await tx.location.findUnique({ where: { id } });
      if (!before) throw new HttpError(404, 'NOT_FOUND', 'Lokasi tidak ditemukan');
      const location = await tx.location.update({
        where: { id },
        data: { ...input, address: input.address ?? null, active: input.active ?? before.active },
      });
      await writeAudit(tx, req, {
        action: 'location.update',
        entity: 'location',
        entityId: id,
        before,
        after: location,
      });
      return location;
    });
    res.json({
      data: {
        id: updated.id,
        name: updated.name,
        address: updated.address,
        active: updated.active,
      } satisfies LocationDto,
    });
  });

  return router;
}
