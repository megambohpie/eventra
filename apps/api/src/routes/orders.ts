import { Router, type Request } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  ALLOCATED_ORDER_STATUSES,
  CANCELLABLE_ORDER_STATUSES,
  DEFAULT_HOLD_MINUTES,
  INTERNAL_ONLY_PIC_ROLES,
  SINGLE_PIC_ROLES,
  WAREHOUSE_PIC_USER_ROLES,
  calendarDayQuerySchema,
  eachDate,
  hasCapability,
  holdInputSchema,
  orderCalendarQuerySchema,
  orderInputSchema,
  orderListQuerySchema,
  effectiveUnitPrice,
  orderNoteSchema,
  picInputSchema,
  quoteInputSchema,
  rentalDays,
  type CalendarDayDetailDto,
  type CalendarDayDto,
  type CalendarOrderDto,
  CALENDAR_HIDDEN_STATUSES,
  type CalendarMovementDto,
  type OrderStatus,
  type OrderSummaryDto,
  type Page,
} from '@eventra/shared';
import { writeAudit } from '../audit';
import { currentUser, requireCapability } from '../auth/middleware';
import { HttpError } from '../errors';
import { parseId } from '../http';
import {
  allocateOrder,
  checkAvailability,
  insufficientStock,
  planItems,
  releaseAllocations,
} from '../orders/availability';
import { cancelPickList, lockOrderPickLists } from '../warehouse/service';
import {
  claimTransition,
  computeTotals,
  dateOnlyToDate,
  expireOrderIfDue,
  isoDate,
  loadOrder,
  nextOrderNumber,
  recordStatus,
  toOrderDto,
  toSummaryDto,
} from '../orders/service';

type Tx = Prisma.TransactionClient;

/** Pesanan yang barangnya sudah/sedang pasti bergerak; dipakai kalender keluar/kembali. */
const MOVEMENT_STATUSES: OrderStatus[] = [
  'CONFIRMED',
  'SCHEDULED',
  'IN_PROGRESS',
  'ISSUE',
  'COMPLETED',
];
const PIC_LOCKED_STATUSES: OrderStatus[] = ['COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED'];

export function ordersRouter(db: PrismaClient): Router {
  const router = Router();

  const items = (o: { items: { productId: string; quantity: number }[] }) =>
    o.items.map((i) => ({ productId: i.productId, quantity: i.quantity }));

  /** Snapshot harga/deposit produk saat ini untuk baris pesanan. */
  async function priceItems(tx: Tx, input: { productId: string; quantity: number }[]) {
    await planItems(tx, input, { requireActive: true });
    const products = await tx.product.findMany({
      where: { id: { in: input.map((i) => i.productId) } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return input.map((i) => {
      const p = byId.get(i.productId);
      if (!p) throw new HttpError(400, 'INVALID_REFERENCE', 'Produk tidak ditemukan');
      return {
        productId: i.productId,
        quantity: i.quantity,
        // Snapshot harga per unit; produk "per m²" dihitung dari tarif × luas satu unit.
        unitPrice: BigInt(
          effectiveUnitPrice({
            pricingUnit: p.pricingUnit,
            price: Number(p.price),
            widthCm: p.widthCm,
            heightCm: p.heightCm,
          }),
        ),
        unitDeposit: p.deposit,
      };
    });
  }

  async function assertCustomerActive(tx: Tx, customerId: string) {
    const customer = await tx.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new HttpError(400, 'INVALID_REFERENCE', 'Pelanggan tidak ditemukan');
    if (!customer.active) throw new HttpError(409, 'CUSTOMER_INACTIVE', 'Pelanggan nonaktif');
  }

  async function respond(id: string) {
    return toOrderDto(db, await loadOrder(db, id));
  }

  // ---------- Daftar & detail ----------

  router.get('/orders', requireCapability('order.read'), async (req, res) => {
    const q = orderListQuerySchema.parse(req.query);
    const and: Prisma.OrderWhereInput[] = [];
    if (q.status) and.push({ status: q.status });
    if (q.customerId) and.push({ customerId: q.customerId });
    if (q.from) and.push({ endDate: { gte: dateOnlyToDate(q.from) } });
    if (q.to) and.push({ startDate: { lte: dateOnlyToDate(q.to) } });
    if (q.q) {
      and.push({
        OR: [
          { number: { contains: q.q, mode: 'insensitive' } },
          { customer: { name: { contains: q.q, mode: 'insensitive' } } },
          { eventLocation: { contains: q.q, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.OrderWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      db.order.findMany({
        where,
        include: { customer: { select: { name: true } } },
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.order.count({ where }),
    ]);
    const data: Page<OrderSummaryDto> = {
      items: rows.map(toSummaryDto),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
    res.json({ data });
  });

  router.get('/orders/:id', requireCapability('order.read'), async (req, res) => {
    res.json({ data: await respond(parseId(req.params.id)) });
  });

  // ---------- Buat / ubah draft ----------

  router.post('/orders', requireCapability('order.write'), async (req, res) => {
    const input = orderInputSchema.parse(req.body);
    const id = await db.$transaction(async (tx) => {
      await assertCustomerActive(tx, input.customerId);
      const priced = await priceItems(tx, input.items);
      const totals = computeTotals(priced, rentalDays(input.startDate, input.endDate));
      const start = dateOnlyToDate(input.startDate);
      const order = await tx.order.create({
        data: {
          number: await nextOrderNumber(tx, start),
          customerId: input.customerId,
          startDate: start,
          endDate: dateOnlyToDate(input.endDate),
          eventLocation: input.eventLocation,
          eventAddress: input.eventAddress ?? null,
          eventLat: input.eventLat ?? null,
          eventLng: input.eventLng ?? null,
          note: input.note ?? null,
          subtotal: totals.subtotal,
          depositTotal: totals.depositTotal,
          createdBy: currentUser(req).id,
          items: { create: priced },
        },
      });
      await recordStatus(tx, order.id, null, 'DRAFT', currentUser(req).id);
      await writeAudit(tx, req, {
        action: 'order.create',
        entity: 'order',
        entityId: order.id,
        after: { ...order, items: priced },
      });
      return order.id;
    });
    res.status(201).json({ data: await respond(id) });
  });

  router.put('/orders/:id', requireCapability('order.write'), async (req, res) => {
    const id = parseId(req.params.id);
    const input = orderInputSchema.parse(req.body);
    await db.$transaction(async (tx) => {
      const before = await loadOrder(tx, id);
      if (before.status !== 'DRAFT') {
        throw new HttpError(409, 'ORDER_NOT_DRAFT', 'Hanya pesanan draft yang dapat diubah');
      }
      await assertCustomerActive(tx, input.customerId);
      const priced = await priceItems(tx, input.items);
      const totals = computeTotals(priced, rentalDays(input.startDate, input.endDate));
      await tx.orderItem.deleteMany({ where: { orderId: id } });
      const updated = await tx.order.update({
        where: { id },
        data: {
          customerId: input.customerId,
          startDate: dateOnlyToDate(input.startDate),
          endDate: dateOnlyToDate(input.endDate),
          eventLocation: input.eventLocation,
          eventAddress: input.eventAddress ?? null,
          eventLat: input.eventLat ?? null,
          eventLng: input.eventLng ?? null,
          note: input.note ?? null,
          subtotal: totals.subtotal,
          depositTotal: totals.depositTotal,
          items: { create: priced },
        },
      });
      await writeAudit(tx, req, {
        action: 'order.update',
        entity: 'order',
        entityId: id,
        before,
        after: { ...updated, items: priced },
      });
    });
    res.json({ data: await respond(id) });
  });

  // ---------- Alur status ----------

  /** Ajukan: stok harus tersedia saat ini (PIC tidak lagi wajib; owner lalu langsung Konfirmasi). */
  router.post('/orders/:id/submit', requireCapability('order.write'), async (req, res) => {
    const id = parseId(req.params.id);
    await db.$transaction(async (tx) => {
      const order = await loadOrder(tx, id);
      if (order.status !== 'DRAFT') {
        throw new HttpError(409, 'INVALID_ORDER_STATE', 'Hanya pesanan draft yang dapat diajukan');
      }
      await assertCustomerActive(tx, order.customerId);
      const availability = await checkAvailability(
        tx,
        items(order),
        isoDate(order.startDate),
        isoDate(order.endDate),
        { excludeOrderId: id },
      );
      if (!availability.ok) throw insufficientStock(availability);
      const from = await claimTransition(tx, id, ['DRAFT'], 'PENDING_REVIEW');
      await recordStatus(tx, id, from, 'PENDING_REVIEW', currentUser(req).id);
      await writeAudit(tx, req, {
        action: 'order.submit',
        entity: 'order',
        entityId: id,
        before: { status: from },
        after: { status: 'PENDING_REVIEW' },
      });
    });
    res.json({ data: await respond(id) });
  });

  /** Penawaran: harga diambil ulang dari produk lalu disimpan sebagai versi baru (append-only). */
  router.post('/orders/:id/quote', requireCapability('order.approve'), async (req, res) => {
    const id = parseId(req.params.id);
    const input = quoteInputSchema.parse(req.body ?? {});
    const user = currentUser(req);
    await db.$transaction(async (tx) => {
      const order = await loadOrder(tx, id);
      if (order.status !== 'PENDING_REVIEW' && order.status !== 'QUOTED') {
        throw new HttpError(
          409,
          'INVALID_ORDER_STATE',
          'Penawaran hanya dari pesanan yang menunggu review',
        );
      }
      const start = isoDate(order.startDate);
      const end = isoDate(order.endDate);
      const availability = await checkAvailability(tx, items(order), start, end, {
        excludeOrderId: id,
      });
      if (!availability.ok) throw insufficientStock(availability);

      const priced = await priceItems(tx, items(order));
      const totals = computeTotals(priced, rentalDays(start, end));
      await tx.orderItem.deleteMany({ where: { orderId: id } });
      await tx.orderItem.createMany({ data: priced.map((p) => ({ ...p, orderId: id })) });
      const last = await tx.orderQuote.aggregate({
        where: { orderId: id },
        _max: { version: true },
      });
      const version = (last._max.version ?? 0) + 1;
      await tx.orderQuote.create({
        data: {
          orderId: id,
          version,
          subtotal: totals.subtotal,
          depositTotal: totals.depositTotal,
          note: input.note ?? null,
          snapshot: JSON.parse(
            JSON.stringify(priced, (_k, v: unknown) => (typeof v === 'bigint' ? Number(v) : v)),
          ) as Prisma.InputJsonValue,
          createdBy: user.id,
        },
      });
      const from = await claimTransition(tx, id, ['PENDING_REVIEW', 'QUOTED'], 'QUOTED', {
        subtotal: totals.subtotal,
        depositTotal: totals.depositTotal,
      });
      await recordStatus(tx, id, from, 'QUOTED', user.id, `Penawaran v${version}`);
      await writeAudit(tx, req, {
        action: 'order.quote',
        entity: 'order',
        entityId: id,
        before: { status: from },
        after: {
          status: 'QUOTED',
          version,
          subtotal: totals.subtotal,
          depositTotal: totals.depositTotal,
        },
      });
    });
    res.json({ data: await respond(id) });
  });

  /** Hold pembayaran: stok ditahan sementara (`expires_at`) sampai konfirmasi atau kadaluarsa. */
  router.post('/orders/:id/hold', requireCapability('order.approve'), async (req, res) => {
    const id = parseId(req.params.id);
    const input = holdInputSchema.parse(req.body ?? {});
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + (input.holdMinutes ?? DEFAULT_HOLD_MINUTES) * 60_000,
    );
    await db.$transaction(async (tx) => {
      const order = await loadOrder(tx, id);
      const from = await claimTransition(tx, id, ['QUOTED'], 'AWAITING_PAYMENT', {
        holdExpiresAt: expiresAt,
      });
      await allocateOrder(
        tx,
        { id, startDate: isoDate(order.startDate), endDate: isoDate(order.endDate) },
        items(order),
        { status: 'HOLD', expiresAt },
        now,
      );
      await recordStatus(tx, id, from, 'AWAITING_PAYMENT', currentUser(req).id);
      await writeAudit(tx, req, {
        action: 'order.hold',
        entity: 'order',
        entityId: id,
        before: { status: from },
        after: { status: 'AWAITING_PAYMENT', holdExpiresAt: expiresAt },
      });
    });
    res.json({ data: await respond(id) });
  });

  /**
   * Konfirmasi atomik: dalam satu transaksi produk dikunci, ketersediaan dihitung ulang dan seluruh
   * tanggal dialokasikan CONFIRMED. Kurang di satu tanggal saja → seluruh transaksi dibatalkan.
   */
  router.post('/orders/:id/confirm', requireCapability('order.approve'), async (req, res) => {
    const id = parseId(req.params.id);
    orderNoteSchema.parse(req.body ?? {});
    const now = new Date();
    if (await expireOrderIfDue(db, id, now)) {
      throw new HttpError(409, 'HOLD_EXPIRED', 'Hold pembayaran sudah kadaluarsa');
    }
    await db.$transaction(async (tx) => {
      const order = await loadOrder(tx, id);
      const from = await claimTransition(
        tx,
        id,
        ['PENDING_REVIEW', 'QUOTED', 'AWAITING_PAYMENT'],
        'CONFIRMED',
        {
          confirmedAt: now,
          holdExpiresAt: null,
        },
      );
      await allocateOrder(
        tx,
        { id, startDate: isoDate(order.startDate), endDate: isoDate(order.endDate) },
        items(order),
        { status: 'CONFIRMED' },
        now,
      );
      await recordStatus(tx, id, from, 'CONFIRMED', currentUser(req).id);
      await writeAudit(tx, req, {
        action: 'order.confirm',
        entity: 'order',
        entityId: id,
        before: { status: from },
        after: { status: 'CONFIRMED' },
      });
    });
    res.json({ data: await respond(id) });
  });

  router.post('/orders/:id/reject', requireCapability('order.approve'), async (req, res) => {
    const id = parseId(req.params.id);
    const { note } = orderNoteSchema.parse(req.body ?? {});
    await db.$transaction(async (tx) => {
      const from = await claimTransition(tx, id, ['PENDING_REVIEW', 'QUOTED'], 'REJECTED');
      await recordStatus(tx, id, from, 'REJECTED', currentUser(req).id, note);
      await writeAudit(tx, req, {
        action: 'order.reject',
        entity: 'order',
        entityId: id,
        before: { status: from },
        after: { status: 'REJECTED', note },
      });
    });
    res.json({ data: await respond(id) });
  });

  /** Batal: stok dilepas segera. Pesanan yang sudah menahan stok hanya dapat dibatalkan `order.approve`. */
  router.post('/orders/:id/cancel', requireCapability('order.write'), async (req, res) => {
    const id = parseId(req.params.id);
    const { note } = orderNoteSchema.parse(req.body ?? {});
    const user = currentUser(req);
    await db.$transaction(async (tx) => {
      const order = await loadOrder(tx, id);
      if (
        ALLOCATED_ORDER_STATUSES.includes(order.status) &&
        !hasCapability(user.role, 'order.approve')
      ) {
        throw new HttpError(403, 'FORBIDDEN', 'Anda tidak memiliki izin untuk aksi ini');
      }
      // Kunci pick list dulu (urutan kunci sama dengan scan) lalu lepas aset yang sudah dipilih.
      await lockOrderPickLists(tx, id);
      const from = await claimTransition(tx, id, CANCELLABLE_ORDER_STATUSES, 'CANCELLED', {
        holdExpiresAt: null,
      });
      const released = await releaseAllocations(tx, id, new Date());
      const activePicks = await tx.pickList.findMany({
        where: { orderId: id, status: { in: ['OPEN', 'VERIFIED'] } },
        select: { id: true },
      });
      for (const p of activePicks) {
        await cancelPickList(tx, p.id, user.id, 'Pesanan dibatalkan');
      }
      await recordStatus(tx, id, from, 'CANCELLED', user.id, note);
      await writeAudit(tx, req, {
        action: 'order.cancel',
        entity: 'order',
        entityId: id,
        before: { status: from },
        after: { status: 'CANCELLED', releasedAllocations: released, note },
      });
    });
    res.json({ data: await respond(id) });
  });

  /** Jadwalkan: PIC gudang keluar, gudang kembali, dan lapangan wajib sudah ditetapkan. */
  router.post('/orders/:id/schedule', requireCapability('order.write'), async (req, res) => {
    const id = parseId(req.params.id);
    await db.$transaction(async (tx) => {
      const order = await loadOrder(tx, id);
      const missing = SINGLE_PIC_ROLES.filter((r) => !order.pics.some((p) => p.role === r));
      if (missing.length > 0) {
        throw new HttpError(409, 'PIC_REQUIRED', `PIC belum lengkap: ${missing.join(', ')}`, {
          roles: [...missing],
        });
      }
      const from = await claimTransition(tx, id, ['CONFIRMED'], 'SCHEDULED');
      await recordStatus(tx, id, from, 'SCHEDULED', currentUser(req).id);
      await writeAudit(tx, req, {
        action: 'order.schedule',
        entity: 'order',
        entityId: id,
        before: { status: from },
        after: { status: 'SCHEDULED' },
      });
    });
    res.json({ data: await respond(id) });
  });

  // ---------- PIC pesanan ----------

  async function picData(tx: Tx, req: Request, input: ReturnType<typeof picInputSchema.parse>) {
    const actor = currentUser(req);
    let name = input.name ?? '';
    let phone = input.phone ?? null;
    let userId: string | null = null;
    if (input.source === 'OWNER') {
      const user = await tx.user.findUnique({ where: { id: input.userId } });
      if (!user || !user.active || user.role === 'CUSTOMER') {
        throw new HttpError(400, 'PIC_USER_INVALID', 'Pengguna internal tidak valid/nonaktif');
      }
      if (
        INTERNAL_ONLY_PIC_ROLES.includes(input.role) &&
        !(WAREHOUSE_PIC_USER_ROLES as readonly string[]).includes(user.role)
      ) {
        throw new HttpError(400, 'PIC_USER_INVALID', 'Pengguna ini tidak dapat menjadi PIC gudang');
      }
      name = user.name;
      phone = user.phone;
      userId = user.id;
    }
    return {
      role: input.role,
      source: input.source,
      userId,
      name,
      phone,
      organization: input.organization ?? null,
      authorization: input.authorization ?? null,
      // Jejak persetujuan penunjukan PIC pihak ketiga.
      approvedById: input.source === 'THIRD_PARTY' ? actor.id : null,
      approvedAt: input.source === 'THIRD_PARTY' ? new Date() : null,
    };
  }

  async function editablePicOrder(tx: Tx, id: string) {
    const order = await loadOrder(tx, id);
    if (PIC_LOCKED_STATUSES.includes(order.status)) {
      throw new HttpError(409, 'ORDER_LOCKED', 'PIC tidak dapat diubah pada pesanan berstatus ini');
    }
    return order;
  }

  router.get('/orders/:id/pics', requireCapability('order.read'), async (req, res) => {
    const order = await toOrderDto(db, await loadOrder(db, parseId(req.params.id)));
    res.json({ data: order.pics });
  });

  router.post('/orders/:id/pics', requireCapability('order.write'), async (req, res) => {
    const id = parseId(req.params.id);
    const input = picInputSchema.parse(req.body);
    await db.$transaction(async (tx) => {
      const order = await editablePicOrder(tx, id);
      if (SINGLE_PIC_ROLES.includes(input.role) && order.pics.some((p) => p.role === input.role)) {
        throw new HttpError(409, 'PIC_ROLE_TAKEN', 'Peran PIC ini sudah ditetapkan; ubah yang ada');
      }
      const pic = await tx.orderPic.create({
        data: { orderId: id, ...(await picData(tx, req, input)) },
      });
      await writeAudit(tx, req, {
        action: 'order_pic.create',
        entity: 'order',
        entityId: id,
        after: pic,
      });
    });
    res.status(201).json({ data: (await respond(id)).pics });
  });

  router.put('/orders/:id/pics/:picId', requireCapability('order.write'), async (req, res) => {
    const id = parseId(req.params.id);
    const picId = parseId(req.params.picId);
    const input = picInputSchema.parse(req.body);
    await db.$transaction(async (tx) => {
      const order = await editablePicOrder(tx, id);
      const before = order.pics.find((p) => p.id === picId);
      if (!before) throw new HttpError(404, 'NOT_FOUND', 'PIC tidak ditemukan');
      if (
        SINGLE_PIC_ROLES.includes(input.role) &&
        order.pics.some((p) => p.role === input.role && p.id !== picId)
      ) {
        throw new HttpError(409, 'PIC_ROLE_TAKEN', 'Peran PIC ini sudah ditetapkan');
      }
      if (
        before.role === 'CUSTOMER_PIC' &&
        input.role !== 'CUSTOMER_PIC' &&
        order.status !== 'DRAFT' &&
        order.pics.filter((p) => p.role === 'CUSTOMER_PIC').length === 1
      ) {
        throw new HttpError(
          409,
          'PIC_REQUIRED',
          'PIC penyewa terakhir tidak boleh diubah perannya',
        );
      }
      const updated = await tx.orderPic.update({
        where: { id: picId },
        data: await picData(tx, req, input),
      });
      await writeAudit(tx, req, {
        action: 'order_pic.update',
        entity: 'order',
        entityId: id,
        before,
        after: updated,
      });
    });
    res.json({ data: (await respond(id)).pics });
  });

  router.delete('/orders/:id/pics/:picId', requireCapability('order.write'), async (req, res) => {
    const id = parseId(req.params.id);
    const picId = parseId(req.params.picId);
    await db.$transaction(async (tx) => {
      const order = await editablePicOrder(tx, id);
      const before = order.pics.find((p) => p.id === picId);
      if (!before) throw new HttpError(404, 'NOT_FOUND', 'PIC tidak ditemukan');
      if (
        before.role === 'CUSTOMER_PIC' &&
        order.status !== 'DRAFT' &&
        order.pics.filter((p) => p.role === 'CUSTOMER_PIC').length === 1
      ) {
        throw new HttpError(409, 'PIC_REQUIRED', 'PIC penyewa terakhir tidak boleh dihapus');
      }
      await tx.orderPic.delete({ where: { id: picId } });
      await writeAudit(tx, req, {
        action: 'order_pic.delete',
        entity: 'order',
        entityId: id,
        before,
      });
    });
    res.json({ data: (await respond(id)).pics });
  });

  // ---------- Kalender stok keluar / kembali ----------

  type MovementOrder = Prisma.OrderGetPayload<{
    include: {
      customer: { select: { name: true } };
      items: { include: { product: { select: { name: true; unitLabel: true } } } };
      pics: true;
    };
  }>;

  const movementInclude = {
    customer: { select: { name: true } },
    items: { include: { product: { select: { name: true, unitLabel: true } } } },
    pics: true,
  } satisfies Prisma.OrderInclude;

  /** Aset fisik per pesanan dari konversi paket (per hari, sama untuk tanggal keluar & kembali). */
  async function unitsPerOrder(orders: MovementOrder[]) {
    const productIds = [...new Set(orders.flatMap((o) => o.items.map((i) => i.productId)))];
    const plans = await planItems(
      db,
      productIds.map((productId) => ({ productId, quantity: 1 })),
    );
    const planById = new Map(plans.map((p) => [p.productId, p]));
    return new Map(
      orders.map((o) => {
        const units = new Map<string, { productName: string; quantity: number }>();
        for (const item of o.items) {
          for (const c of planById.get(item.productId)?.components ?? []) {
            const cur = units.get(c.productId) ?? { productName: c.productName, quantity: 0 };
            cur.quantity += c.perUnit * item.quantity;
            units.set(c.productId, cur);
          }
        }
        return [o.id, [...units.values()]] as [string, { productName: string; quantity: number }[]];
      }),
    );
  }

  const totalUnits = (u: readonly { quantity: number }[]) => u.reduce((n, x) => n + x.quantity, 0);

  router.get('/calendar', requireCapability('order.read'), async (req, res) => {
    const { from, to } = orderCalendarQuerySchema.parse(req.query);
    const range = { gte: dateOnlyToDate(from), lte: dateOnlyToDate(to) };
    const orders = await db.order.findMany({
      where: {
        status: { in: MOVEMENT_STATUSES },
        OR: [{ startDate: range }, { endDate: range }],
      },
      include: movementInclude,
    });
    const units = await unitsPerOrder(orders);
    const days = new Map<string, CalendarDayDto>(
      eachDate(from, to).map((date) => [
        date,
        { date, outgoingOrders: 0, outgoingUnits: 0, returningOrders: 0, returningUnits: 0 },
      ]),
    );
    for (const o of orders) {
      const n = totalUnits(units.get(o.id) ?? []);
      const out = days.get(isoDate(o.startDate));
      if (out) {
        out.outgoingOrders += 1;
        out.outgoingUnits += n;
      }
      const back = days.get(isoDate(o.endDate));
      if (back) {
        back.returningOrders += 1;
        back.returningUnits += n;
      }
    }
    res.json({ data: [...days.values()] });
  });

  /** Pesanan aktif (bukan ditolak/batal/kedaluwarsa) yang rentang sewanya beririsan dengan [from, to]. */
  router.get('/calendar/orders', requireCapability('order.read'), async (req, res) => {
    const { from, to } = orderCalendarQuerySchema.parse(req.query);
    const orders = await db.order.findMany({
      where: {
        status: { notIn: [...CALENDAR_HIDDEN_STATUSES] },
        startDate: { lte: dateOnlyToDate(to) },
        endDate: { gte: dateOnlyToDate(from) },
      },
      select: {
        id: true,
        number: true,
        status: true,
        startDate: true,
        endDate: true,
        customer: { select: { name: true } },
      },
      orderBy: [{ startDate: 'asc' }, { number: 'asc' }],
    });
    const data: CalendarOrderDto[] = orders.map((o) => ({
      orderId: o.id,
      orderNumber: o.number,
      status: o.status,
      customerName: o.customer.name,
      startDate: isoDate(o.startDate),
      endDate: isoDate(o.endDate),
    }));
    res.json({ data });
  });

  router.get('/calendar/day', requireCapability('order.read'), async (req, res) => {
    const { date } = calendarDayQuerySchema.parse(req.query);
    const day = dateOnlyToDate(date);
    const [outgoing, returning] = await Promise.all([
      db.order.findMany({
        where: { status: { in: MOVEMENT_STATUSES }, startDate: day },
        include: movementInclude,
        orderBy: { number: 'asc' },
      }),
      db.order.findMany({
        where: { status: { in: MOVEMENT_STATUSES }, endDate: day },
        include: movementInclude,
        orderBy: { number: 'asc' },
      }),
    ]);
    const units = await unitsPerOrder([...outgoing, ...returning]);
    const toMovement = (o: MovementOrder): CalendarMovementDto => ({
      orderId: o.id,
      orderNumber: o.number,
      status: o.status,
      customerName: o.customer.name,
      eventLocation: o.eventLocation,
      startDate: isoDate(o.startDate),
      endDate: isoDate(o.endDate),
      items: o.items.map((i) => ({
        productName: i.product.name,
        unitLabel: i.product.unitLabel,
        quantity: i.quantity,
      })),
      units: units.get(o.id) ?? [],
      pics: o.pics.map((p) => ({ role: p.role, name: p.name, phone: p.phone, source: p.source })),
    });
    const data: CalendarDayDetailDto = {
      date,
      outgoing: outgoing.map(toMovement),
      returning: returning.map(toMovement),
    };
    res.json({ data });
  });

  return router;
}
