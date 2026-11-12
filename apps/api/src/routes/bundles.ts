import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { bundleInputSchema, type ProductBundleDto } from '@eventra/shared';
import { writeAudit } from '../audit';
import { requireCapability } from '../auth/middleware';
import { HttpError } from '../errors';
import { parseId } from '../http';

const bundleInclude = { component: { select: { id: true, name: true } } } as const;

/**
 * Aturan konversi satuan sewa → aset fisik (mis. 1 meter LED → 4 panel).
 * Hanya satu tingkat: komponen tidak boleh punya paket sendiri dan produk berpaket tidak boleh
 * menjadi komponen produk lain.
 */
export function bundlesRouter(db: PrismaClient): Router {
  const router = Router();

  const load = async (productId: string): Promise<ProductBundleDto> => {
    const product = await db.product.findUnique({
      where: { id: productId },
      include: { bundleOf: { include: bundleInclude, orderBy: { createdAt: 'asc' } } },
    });
    if (!product) throw new HttpError(404, 'NOT_FOUND', 'Produk tidak ditemukan');
    return {
      productId: product.id,
      productName: product.name,
      unitLabel: product.unitLabel,
      components: product.bundleOf.map((b) => ({
        componentProductId: b.component.id,
        componentName: b.component.name,
        quantity: b.quantity,
      })),
    };
  };

  /** Semua produk yang memiliki aturan paket (atau satu produk bila `productId` diberikan). */
  router.get('/product-bundles', requireCapability('product.read'), async (req, res) => {
    if (typeof req.query.productId === 'string') {
      res.json({ data: [await load(parseId(req.query.productId))] });
      return;
    }
    const products = await db.product.findMany({
      where: { bundleOf: { some: {} } },
      include: { bundleOf: { include: bundleInclude, orderBy: { createdAt: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    const data: ProductBundleDto[] = products.map((p) => ({
      productId: p.id,
      productName: p.name,
      unitLabel: p.unitLabel,
      components: p.bundleOf.map((b) => ({
        componentProductId: b.component.id,
        componentName: b.component.name,
        quantity: b.quantity,
      })),
    }));
    res.json({ data });
  });

  router.get('/product-bundles/:productId', requireCapability('product.read'), async (req, res) => {
    res.json({ data: await load(parseId(req.params.productId)) });
  });

  /** Ganti seluruh komponen produk; daftar kosong = hapus aturan paket (produk dipenuhi asetnya sendiri). */
  router.put(
    '/product-bundles/:productId',
    requireCapability('product.write'),
    async (req, res) => {
      const productId = parseId(req.params.productId);
      const input = bundleInputSchema.parse(req.body);

      await db.$transaction(async (tx) => {
        const product = await tx.product.findUnique({
          where: { id: productId },
          include: { bundleOf: true, usedIn: true },
        });
        if (!product) throw new HttpError(404, 'NOT_FOUND', 'Produk tidak ditemukan');

        if (input.components.length > 0 && product.usedIn.length > 0) {
          throw new HttpError(
            409,
            'BUNDLE_NESTED',
            'Produk ini menjadi komponen paket lain sehingga tidak boleh berpaket',
          );
        }
        const ids = input.components.map((c) => c.componentProductId);
        if (ids.includes(productId)) {
          throw new HttpError(400, 'BUNDLE_SELF', 'Produk tidak boleh menjadi komponennya sendiri');
        }
        const components = await tx.product.findMany({
          where: { id: { in: ids } },
          include: { bundleOf: { select: { id: true } } },
        });
        if (components.length !== ids.length) {
          throw new HttpError(400, 'INVALID_REFERENCE', 'Komponen paket tidak ditemukan');
        }
        if (components.some((c) => c.bundleOf.length > 0)) {
          throw new HttpError(409, 'BUNDLE_NESTED', 'Komponen paket tidak boleh berupa paket lain');
        }
        if (components.some((c) => !c.active)) {
          throw new HttpError(409, 'PRODUCT_INACTIVE', 'Komponen paket nonaktif');
        }

        await tx.productBundle.deleteMany({ where: { productId } });
        if (input.components.length > 0) {
          await tx.productBundle.createMany({
            data: input.components.map((c) => ({
              productId,
              componentProductId: c.componentProductId,
              quantity: c.quantity,
            })),
          });
        }
        await writeAudit(tx, req, {
          action: 'product_bundle.replace',
          entity: 'product',
          entityId: productId,
          before: product.bundleOf.map((b) => ({
            componentProductId: b.componentProductId,
            quantity: b.quantity,
          })),
          after: input.components,
        });
      });
      res.json({ data: await load(productId) });
    },
  );

  return router;
}
