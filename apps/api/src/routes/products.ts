import { Router } from 'express';
import type { Category, Prisma, PrismaClient, Product } from '@prisma/client';
import { productInputSchema, type Page, type ProductDto } from '@eventra/shared';
import { writeAudit } from '../audit';
import { currentUser, requireCapability } from '../auth/middleware';
import { HttpError } from '../errors';
import { parseId, parseListQuery } from '../http';

type ProductWithCategory = Product & { category: Category };

export const toProductDto = (p: ProductWithCategory): ProductDto => ({
  id: p.id,
  name: p.name,
  sku: p.sku,
  categoryId: p.categoryId,
  category: { id: p.category.id, name: p.category.name },
  pricingUnit: p.pricingUnit,
  unitLabel: p.unitLabel,
  price: Number(p.price),
  deposit: Number(p.deposit),
  active: p.active,
});

const withCategory = { category: true };

export function productsRouter(db: PrismaClient): Router {
  const router = Router();

  router.get('/products', requireCapability('product.read'), async (req, res) => {
    const { q, page, pageSize } = parseListQuery(req.query);
    const where: Prisma.ProductWhereInput = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { sku: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};
    const [items, total] = await Promise.all([
      db.product.findMany({
        where,
        include: withCategory,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.product.count({ where }),
    ]);
    const data: Page<ProductDto> = { items: items.map(toProductDto), total, page, pageSize };
    res.json({ data });
  });

  router.get('/products/:id', requireCapability('product.read'), async (req, res) => {
    const product = await db.product.findUnique({
      where: { id: parseId(req.params.id) },
      include: withCategory,
    });
    if (!product) throw new HttpError(404, 'NOT_FOUND', 'Produk tidak ditemukan');
    res.json({ data: toProductDto(product) });
  });

  router.post('/products', requireCapability('product.write'), async (req, res) => {
    const input = productInputSchema.parse(req.body);
    const product = await db.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: { ...input, active: input.active ?? true, createdBy: currentUser(req).id },
        include: withCategory,
      });
      await writeAudit(tx, req, {
        action: 'product.create',
        entity: 'product',
        entityId: created.id,
        after: created,
      });
      return created;
    });
    res.status(201).json({ data: toProductDto(product) });
  });

  router.put('/products/:id', requireCapability('product.write'), async (req, res) => {
    const id = parseId(req.params.id);
    const input = productInputSchema.parse(req.body);
    const product = await db.$transaction(async (tx) => {
      const before = await tx.product.findUnique({ where: { id } });
      if (!before) throw new HttpError(404, 'NOT_FOUND', 'Produk tidak ditemukan');
      const updated = await tx.product.update({
        where: { id },
        data: { ...input, sku: input.sku ?? null, active: input.active ?? before.active },
        include: withCategory,
      });
      await writeAudit(tx, req, {
        action: 'product.update',
        entity: 'product',
        entityId: id,
        before,
        after: updated,
      });
      return updated;
    });
    res.json({ data: toProductDto(product) });
  });

  return router;
}
