import { Router } from 'express';
import type { Customer, Prisma, PrismaClient } from '@prisma/client';
import {
  customerCreateSchema,
  customerUpdateSchema,
  type CustomerDto,
  type Page,
} from '@eventra/shared';
import { writeAudit } from '../audit';
import { currentUser, requireCapability } from '../auth/middleware';
import { HttpError } from '../errors';
import { parseId, parseListQuery } from '../http';

export const toCustomerDto = (c: Customer): CustomerDto => ({
  id: c.id,
  type: c.type,
  name: c.name,
  email: c.email,
  phone: c.phone,
  address: c.address,
  verificationNote: c.verificationNote,
  active: c.active,
});

/** PIC tidak disimpan di pelanggan: PIC ditunjuk per pesanan (Fase 03, `order_pics`). */
export function customersRouter(db: PrismaClient): Router {
  const router = Router();

  router.get('/customers', requireCapability('customer.read'), async (req, res) => {
    const { q, page, pageSize } = parseListQuery(req.query);
    const where: Prisma.CustomerWhereInput = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};
    const [items, total] = await Promise.all([
      db.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.customer.count({ where }),
    ]);
    const data: Page<CustomerDto> = { items: items.map(toCustomerDto), total, page, pageSize };
    res.json({ data });
  });

  router.get('/customers/:id', requireCapability('customer.read'), async (req, res) => {
    const customer = await db.customer.findUnique({ where: { id: parseId(req.params.id) } });
    if (!customer) throw new HttpError(404, 'NOT_FOUND', 'Pelanggan tidak ditemukan');
    res.json({ data: toCustomerDto(customer) });
  });

  router.post('/customers', requireCapability('customer.write'), async (req, res) => {
    const input = customerCreateSchema.parse(req.body);
    const customer = await db.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: { ...input, createdBy: currentUser(req).id },
      });
      await writeAudit(tx, req, {
        action: 'customer.create',
        entity: 'customer',
        entityId: created.id,
        after: created,
      });
      return created;
    });
    res.status(201).json({ data: toCustomerDto(customer) });
  });

  router.put('/customers/:id', requireCapability('customer.write'), async (req, res) => {
    const id = parseId(req.params.id);
    const input = customerUpdateSchema.parse(req.body);
    const customer = await db.$transaction(async (tx) => {
      const before = await tx.customer.findUnique({ where: { id } });
      if (!before) throw new HttpError(404, 'NOT_FOUND', 'Pelanggan tidak ditemukan');
      const updated = await tx.customer.update({
        where: { id },
        data: {
          type: input.type,
          name: input.name,
          email: input.email ?? null,
          phone: input.phone ?? null,
          address: input.address ?? null,
          verificationNote: input.verificationNote ?? null,
          active: input.active ?? before.active,
        },
      });
      await writeAudit(tx, req, {
        action: 'customer.update',
        entity: 'customer',
        entityId: id,
        before,
        after: updated,
      });
      return updated;
    });
    res.json({ data: toCustomerDto(customer) });
  });

  return router;
}
