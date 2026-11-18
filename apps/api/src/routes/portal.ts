import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import {
  MAX_SIGNATURE_BYTES,
  REPORTABLE_ASSET_STATUSES,
  normalizePhone,
  portalDocumentSignSchema,
  portalLoginSchema,
  type PortalOrderDto,
  type PortalSession,
} from '@eventra/shared';
import { writeAudit } from '../audit';
import { currentUser } from '../auth/middleware';
import { hashPassword } from '../auth/password';
import { PORTAL_TTL_SECONDS, signAccessToken } from '../auth/tokens';
import { HttpError } from '../errors';
import { balanceOf, invoiceInclude, isoDay } from '../finance/service';
import { detectImageMime, lockPickList } from '../warehouse/service';

const PORTAL_EMAIL = 'portal@system.eventra.invalid';

/**
 * Akun sistem pelaku untuk aksi pelanggan di portal (laporan insiden, audit). Tidak bisa dipakai login
 * (kata sandi acak yang tak pernah diketahui); cakupan datanya selalu dibatasi pesanan pada token.
 */
export async function ensurePortalUser(db: PrismaClient): Promise<string> {
  const existing = await db.user.findUnique({ where: { email: PORTAL_EMAIL } });
  const user =
    existing ??
    (await db.user.create({
      data: {
        name: 'Pelanggan (portal)',
        email: PORTAL_EMAIL,
        passwordHash: await hashPassword(randomBytes(24).toString('base64url')),
        role: 'CUSTOMER',
        active: true,
      },
    }));
  return user.id;
}

const denied = () =>
  new HttpError(401, 'INVALID_PORTAL_CREDENTIALS', 'Nomor HP atau nomor pesanan tidak cocok');

/** Login pelanggan (publik): token hanya berlaku untuk satu pesanan. */
export function portalPublicRouter(db: PrismaClient, jwtSecret: string): Router {
  const router = Router();

  router.post('/portal/login', async (req, res) => {
    const input = portalLoginSchema.parse(req.body);
    const order = await db.order.findUnique({
      where: { number: input.orderNumber },
      include: { customer: { select: { name: true, phone: true } } },
    });
    const stored = order?.customer.phone ? normalizePhone(order.customer.phone) : null;
    // Pesan sama untuk pesanan tak ada, HP salah, atau pesanan belum aktif: keberadaan pesanan tidak bocor.
    if (!order || !stored || stored !== normalizePhone(input.phone) || order.status === 'DRAFT') {
      await writeAudit(db, req, {
        action: 'portal.login_failed',
        entity: 'order',
        after: { orderNumber: input.orderNumber },
      });
      throw denied();
    }
    const userId = await ensurePortalUser(db);
    const session: PortalSession = {
      accessToken: signAccessToken(
        jwtSecret,
        { sub: userId, role: 'CUSTOMER', ord: order.id },
        PORTAL_TTL_SECONDS,
      ),
      orderNumber: order.number,
      customerName: order.customer.name,
      expiresAt: new Date(Date.now() + PORTAL_TTL_SECONDS * 1000).toISOString(),
    };
    await writeAudit(db, req, {
      action: 'portal.login',
      entity: 'order',
      entityId: order.id,
      actorId: userId,
    });
    res.json({ data: session });
  });

  return router;
}

/** Data satu pesanan bagi pelanggan yang login lewat portal. */
export function portalRouter(db: PrismaClient): Router {
  const router = Router();

  router.get('/portal/order', async (req, res) => {
    const user = currentUser(req);
    if (!user.portalOrderId) throw new HttpError(403, 'FORBIDDEN', 'Hanya untuk akses pelanggan');
    const order = await db.order.findUnique({
      where: { id: user.portalOrderId },
      include: {
        customer: { select: { name: true } },
        items: { include: { product: { select: { name: true } } } },
        pickLists: {
          where: { status: { in: ['DISPATCHED', 'RETURN_ISSUE'] } },
          select: {
            items: {
              where: { status: 'DISPATCHED' },
              select: {
                asset: { select: { code: true, status: true } },
                product: { select: { name: true } },
              },
            },
          },
        },
        handoverDocuments: {
          orderBy: [{ number: 'asc' }, { version: 'desc' }],
          include: { signatures: { select: { role: true } } },
        },
        incidents: {
          where: { status: { not: 'DRAFT' } },
          orderBy: { createdAt: 'desc' },
          include: { asset: { select: { code: true, product: { select: { name: true } } } } },
        },
      },
    });
    if (!order) throw new HttpError(404, 'NOT_FOUND', 'Pesanan tidak ditemukan');
    const invoices = await db.invoice.findMany({
      where: { orderId: order.id, status: { not: 'VOID' } },
      include: invoiceInclude,
      orderBy: { issuedAt: 'asc' },
    });
    const signers = await db.orderPic.findMany({
      where: { orderId: order.id, role: { in: ['CUSTOMER_PIC', 'FIELD'] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    });
    const today = isoDay(new Date());
    const seen = new Set<string>();
    const data: PortalOrderDto = {
      number: order.number,
      status: order.status,
      customerName: order.customer.name,
      startDate: isoDay(order.startDate),
      endDate: isoDay(order.endDate),
      eventLocation: order.eventLocation,
      eventAddress: order.eventAddress,
      subtotal: Number(order.subtotal),
      depositTotal: Number(order.depositTotal),
      items: order.items.map((i) => ({
        productName: i.product.name,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
      })),
      assets: order.pickLists
        .flatMap((p) => p.items)
        .map((i) => ({
          code: i.asset.code,
          productName: i.product.name,
          reportable: REPORTABLE_ASSET_STATUSES.includes(i.asset.status),
        }))
        .sort((a, b) => a.code.localeCompare(b.code)),
      invoices: invoices.map((inv) => {
        const b = balanceOf(inv, today);
        return {
          id: inv.id,
          number: inv.number,
          status: inv.status,
          rentAmount: Number(inv.rentAmount),
          depositAmount: Number(inv.depositAmount),
          total: b.total,
          paid: b.paid,
          outstanding: b.outstanding,
          dueDate: isoDay(inv.dueDate),
          // Hanya pembayaran diterima/menunggu; data staf (pencatat, referensi) tidak ikut.
          payments: inv.payments
            .filter((p) => p.status === 'SUCCEEDED' || p.status === 'PENDING')
            .map((p) => ({
              id: p.id,
              purpose: p.purpose,
              method: p.method,
              status: p.status,
              amount: Number(p.amount),
              paidAt: p.paidAt.toISOString(),
            })),
        };
      }),
      documents: order.handoverDocuments.map((d) => {
        const isLatest = !seen.has(d.number);
        seen.add(d.number);
        return {
          id: d.id,
          number: d.number,
          version: d.version,
          type: d.type,
          createdAt: d.createdAt.toISOString(),
          fullySigned: ['WAREHOUSE', 'COUNTERPART'].every((r) =>
            d.signatures.some((s) => s.role === r),
          ),
          isLatest,
          counterpartSigned: d.signatures.some((s) => s.role === 'COUNTERPART'),
          signers: isLatest ? signers : [],
        };
      }),
      incidents: order.incidents.map((i) => ({
        id: i.id,
        number: i.number,
        status: i.status,
        urgency: i.urgency,
        assetCode: i.asset.code,
        productName: i.asset.product.name,
        createdAt: i.createdAt.toISOString(),
      })),
    };
    res.json({ data });
  });

  /**
   * Pelanggan menandatangani dokumen pesanannya sebagai pihak penerima/pengembali. Dokumen tidak diubah
   * (tanda tangan = baris append-only); hanya versi terbaru, dan penanda tangan harus PIC pelanggan pesanan.
   */
  router.post('/portal/documents/:id/sign', async (req, res) => {
    const user = currentUser(req);
    if (!user.portalOrderId) throw new HttpError(403, 'FORBIDDEN', 'Hanya untuk akses pelanggan');
    const id = z.uuid().parse(req.params.id);
    const input = portalDocumentSignSchema.parse(req.body);
    const png = Buffer.from(input.image.slice(input.image.indexOf(',') + 1), 'base64');
    if (
      png.length === 0 ||
      png.length > MAX_SIGNATURE_BYTES ||
      detectImageMime(png) !== 'image/png'
    ) {
      throw new HttpError(400, 'INVALID_IMAGE', 'Tanda tangan harus berupa gambar PNG yang valid');
    }
    await db.$transaction(async (tx) => {
      const doc = await tx.handoverDocument.findUnique({
        where: { id },
        include: { signatures: { select: { role: true } } },
      });
      // Dokumen pesanan lain diperlakukan sama seperti tidak ada.
      if (!doc || doc.orderId !== user.portalOrderId) {
        throw new HttpError(404, 'NOT_FOUND', 'Dokumen tidak ditemukan');
      }
      await lockPickList(tx, doc.pickListId);
      const latest = await tx.handoverDocument.aggregate({
        where: { pickListId: doc.pickListId, type: doc.type },
        _max: { version: true },
      });
      if (latest._max.version !== doc.version) {
        throw new HttpError(409, 'DOCUMENT_SUPERSEDED', 'Dokumen ini sudah digantikan revisi baru');
      }
      if (doc.signatures.some((s) => s.role === 'COUNTERPART')) {
        throw new HttpError(409, 'ALREADY_SIGNED', 'Peran ini sudah menandatangani dokumen');
      }
      // Tanpa picId: pemesan sendiri (yang login dengan no HP + no pesanan) menandatangani.
      let picId: string | null = null;
      let signerName: string;
      let signerRole = 'CUSTOMER_PIC';
      if (input.picId) {
        const pic = await tx.orderPic.findFirst({
          where: { id: input.picId, orderId: doc.orderId, role: { in: ['CUSTOMER_PIC', 'FIELD'] } },
        });
        if (!pic) {
          throw new HttpError(
            400,
            'SIGNER_INVALID',
            'PIC tidak sesuai untuk peran penandatangan ini',
          );
        }
        picId = pic.id;
        signerName = pic.name;
        signerRole = pic.role;
      } else {
        const order = await tx.order.findUniqueOrThrow({
          where: { id: doc.orderId },
          select: { customer: { select: { name: true } } },
        });
        signerName = order.customer.name;
      }
      await tx.documentSignature.create({
        data: {
          documentId: id,
          role: 'COUNTERPART',
          picId,
          signerName,
          signerRole,
          image: new Uint8Array(png),
          signedBy: user.id,
        },
      });
      await writeAudit(tx, req, {
        action: 'handover.sign',
        entity: 'handover_document',
        entityId: id,
        after: {
          number: doc.number,
          version: doc.version,
          role: 'COUNTERPART',
          picId,
          signer: signerName,
          via: 'portal',
        },
      });
    });
    res.json({ data: { signed: true } });
  });

  return router;
}
