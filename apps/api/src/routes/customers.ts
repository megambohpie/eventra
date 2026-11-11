import { Router } from 'express';
import type { Customer, CustomerContact, Prisma, PrismaClient } from '@prisma/client';
import {
  customerContactInputSchema,
  customerContactUpdateSchema,
  customerCreateSchema,
  customerUpdateSchema,
  type CustomerContactDto,
  type CustomerDto,
  type Page,
} from '@eventra/shared';
import { writeAudit } from '../audit';
import { currentUser, requireCapability } from '../auth/middleware';
import { HttpError } from '../errors';
import { parseId, parseListQuery } from '../http';

type CustomerWithContacts = Customer & { contacts: CustomerContact[] };

const toContactDto = (c: CustomerContact): CustomerContactDto => ({
  id: c.id,
  customerId: c.customerId,
  name: c.name,
  phone: c.phone,
  position: c.position,
  active: c.active,
});

export const toCustomerDto = (c: CustomerWithContacts): CustomerDto => ({
  id: c.id,
  type: c.type,
  name: c.name,
  email: c.email,
  phone: c.phone,
  address: c.address,
  verificationNote: c.verificationNote,
  active: c.active,
  contacts: c.contacts.map(toContactDto),
});

const withContacts = { contacts: { orderBy: { createdAt: 'asc' as const } } };

const noContact = () =>
  new HttpError(
    409,
    'CUSTOMER_CONTACT_REQUIRED',
    'Pelanggan wajib memiliki minimal satu PIC penyewa aktif',
  );

export function customersRouter(db: PrismaClient): Router {
  const router = Router();

  router.get('/customers', requireCapability('customer.read'), async (req, res) => {
    const { q, page, pageSize } = parseListQuery(req.query);
    const where: Prisma.CustomerWhereInput = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
            { contacts: { some: { name: { contains: q, mode: 'insensitive' } } } },
          ],
        }
      : {};
    const [items, total] = await Promise.all([
      db.customer.findMany({
        where,
        include: withContacts,
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
    const customer = await db.customer.findUnique({
      where: { id: parseId(req.params.id) },
      include: withContacts,
    });
    if (!customer) throw new HttpError(404, 'NOT_FOUND', 'Pelanggan tidak ditemukan');
    res.json({ data: toCustomerDto(customer) });
  });

  router.post('/customers', requireCapability('customer.write'), async (req, res) => {
    const { contacts, ...input } = customerCreateSchema.parse(req.body);
    const customer = await db.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: { ...input, createdBy: currentUser(req).id, contacts: { create: contacts } },
        include: withContacts,
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
      const before = await tx.customer.findUnique({ where: { id }, include: withContacts });
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
        include: withContacts,
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

  router.post('/customers/:id/contacts', requireCapability('customer.write'), async (req, res) => {
    const customerId = parseId(req.params.id);
    const input = customerContactInputSchema.parse(req.body);
    const contact = await db.$transaction(async (tx) => {
      const exists = await tx.customer.findUnique({ where: { id: customerId } });
      if (!exists) throw new HttpError(404, 'NOT_FOUND', 'Pelanggan tidak ditemukan');
      const created = await tx.customerContact.create({ data: { ...input, customerId } });
      await writeAudit(tx, req, {
        action: 'customer_contact.create',
        entity: 'customer_contact',
        entityId: created.id,
        after: created,
      });
      return created;
    });
    res.status(201).json({ data: toContactDto(contact) });
  });

  router.put(
    '/customers/:id/contacts/:contactId',
    requireCapability('customer.write'),
    async (req, res) => {
      const customerId = parseId(req.params.id);
      const contactId = parseId(req.params.contactId);
      const input = customerContactUpdateSchema.parse(req.body);
      const contact = await db.$transaction(async (tx) => {
        // Kunci baris pelanggan agar dua penonaktifan PIC bersamaan tidak menyisakan nol PIC.
        await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customerId}::uuid FOR UPDATE`;
        const before = await tx.customerContact.findFirst({
          where: { id: contactId, customerId },
        });
        if (!before) throw new HttpError(404, 'NOT_FOUND', 'PIC tidak ditemukan');
        const active = input.active ?? before.active;
        if (before.active && !active) {
          const others = await tx.customerContact.count({
            where: { customerId, active: true, id: { not: contactId } },
          });
          if (others === 0) throw noContact();
        }
        const updated = await tx.customerContact.update({
          where: { id: contactId },
          data: {
            name: input.name,
            phone: input.phone,
            position: input.position ?? null,
            active,
          },
        });
        await writeAudit(tx, req, {
          action: 'customer_contact.update',
          entity: 'customer_contact',
          entityId: contactId,
          before,
          after: updated,
        });
        return updated;
      });
      res.json({ data: toContactDto(contact) });
    },
  );

  return router;
}
