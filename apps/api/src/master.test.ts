import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ROLES, type Role } from '@eventra/shared';
import { createTestApp, db, loginAs, resetDb } from '../test/helpers';

const contact = { name: 'Budi', phone: '08123456789', position: 'Koordinator' };
const customerBody = { type: 'COMPANY', name: 'PT Maju Jaya', contacts: [contact] };

describe('RBAC', () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  const endpoints = [
    { method: 'get', path: '/api/v1/customers', cap: 'customer.read' },
    { method: 'get', path: '/api/v1/products', cap: 'product.read' },
    { method: 'get', path: '/api/v1/categories', cap: 'master.read' },
    { method: 'get', path: '/api/v1/locations', cap: 'master.read' },
    { method: 'get', path: '/api/v1/users', cap: 'user.read' },
  ] as const;

  it('tanpa token semua endpoint master 401', async () => {
    const { app } = createTestApp();
    for (const e of endpoints) {
      expect((await request(app)[e.method](e.path)).status).toBe(401);
    }
    expect((await request(app).post('/api/v1/customers').send(customerBody)).status).toBe(401);
  });

  it('akses baca mengikuti capability tiap role', async () => {
    const { app } = createTestApp();
    const { hasCapability } = await import('@eventra/shared');
    for (const role of ROLES) {
      const token = await loginAs(app, role as Role);
      for (const e of endpoints) {
        const res = await request(app)[e.method](e.path).set('Authorization', `Bearer ${token}`);
        expect(res.status, `${role} ${e.path}`).toBe(hasCapability(role, e.cap) ? 200 : 403);
      }
      await resetDb();
    }
  });

  it('role tanpa capability tulis ditolak 403 dan tidak mengubah data', async () => {
    const { app } = createTestApp();
    for (const role of [
      'OWNER',
      'OPS_COORDINATOR',
      'WAREHOUSE',
      'FIELD_PIC',
      'CUSTOMER',
    ] as const) {
      const token = await loginAs(app, role);
      const auth = { Authorization: `Bearer ${token}` };
      expect(
        (await request(app).post('/api/v1/customers').set(auth).send(customerBody)).status,
      ).toBe(403);
      expect(
        (await request(app).post('/api/v1/categories').set(auth).send({ name: 'X' })).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .post('/api/v1/users')
            .set(auth)
            .send({ name: 'a', email: 'a@b.co', password: 'Password123!', role: 'ADMIN' })
        ).status,
      ).toBe(403);
      await resetDb();
    }
    expect(await db.customer.count()).toBe(0);
  });
});

describe('Pelanggan dan PIC', () => {
  beforeEach(resetDb);

  it('admin membuat pelanggan beserta PIC dan audit log tercatat', async () => {
    const { app } = createTestApp();
    const auth = { Authorization: `Bearer ${await loginAs(app, 'ADMIN')}` };
    const res = await request(app).post('/api/v1/customers').set(auth).send(customerBody);
    expect(res.status).toBe(201);
    expect(res.body.data.contacts).toHaveLength(1);
    expect(res.body.data.contacts[0]).toMatchObject({ name: 'Budi', active: true });
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'customer.create' } });
    expect(audit.entityId).toBe(res.body.data.id);
    expect(audit.actorId).toEqual(expect.any(String));
  });

  it('pelanggan tanpa PIC ditolak', async () => {
    const { app } = createTestApp();
    const auth = { Authorization: `Bearer ${await loginAs(app, 'ADMIN')}` };
    for (const contacts of [undefined, []]) {
      const res = await request(app)
        .post('/api/v1/customers')
        .set(auth)
        .send({ ...customerBody, contacts });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.fields.contacts).toBeDefined();
    }
    expect(await db.customer.count()).toBe(0);
  });

  it('PIC aktif terakhir tidak bisa dinonaktifkan; setelah ada PIC lain boleh', async () => {
    const { app } = createTestApp();
    const auth = { Authorization: `Bearer ${await loginAs(app, 'ADMIN')}` };
    const created = (await request(app).post('/api/v1/customers').set(auth).send(customerBody)).body
      .data;
    const first = created.contacts[0];
    const url = (id: string) => `/api/v1/customers/${created.id}/contacts/${id}`;

    const blocked = await request(app)
      .put(url(first.id))
      .set(auth)
      .send({ ...contact, active: false });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('CUSTOMER_CONTACT_REQUIRED');

    const second = await request(app)
      .post(`/api/v1/customers/${created.id}/contacts`)
      .set(auth)
      .send({ name: 'Sari', phone: '0899999999' });
    expect(second.status).toBe(201);

    const ok = await request(app)
      .put(url(first.id))
      .set(auth)
      .send({ ...contact, active: false });
    expect(ok.status).toBe(200);
    expect(ok.body.data.active).toBe(false);

    // Sekarang Sari adalah PIC aktif terakhir.
    const again = await request(app)
      .put(url(second.body.data.id))
      .set(auth)
      .send({ name: 'Sari', phone: '0899999999', active: false });
    expect(again.status).toBe(409);
  });

  it('dua penonaktifan PIC bersamaan tidak menyisakan nol PIC aktif', async () => {
    const { app } = createTestApp();
    const auth = { Authorization: `Bearer ${await loginAs(app, 'ADMIN')}` };
    const created = (
      await request(app)
        .post('/api/v1/customers')
        .set(auth)
        .send({ ...customerBody, contacts: [contact, { name: 'Sari', phone: '0899999999' }] })
    ).body.data;
    const results = await Promise.all(
      created.contacts.map((c: { id: string; name: string; phone: string }) =>
        request(app)
          .put(`/api/v1/customers/${created.id}/contacts/${c.id}`)
          .set(auth)
          .send({ name: c.name, phone: c.phone, active: false }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await db.customerContact.count({ where: { active: true } })).toBe(1);
  });

  it('update mencatat before/after; id tak valid 404; pencarian bekerja', async () => {
    const { app } = createTestApp();
    const auth = { Authorization: `Bearer ${await loginAs(app, 'ADMIN')}` };
    const created = (await request(app).post('/api/v1/customers').set(auth).send(customerBody)).body
      .data;
    const upd = await request(app)
      .put(`/api/v1/customers/${created.id}`)
      .set(auth)
      .send({ type: 'COMPANY', name: 'PT Maju Mundur' });
    expect(upd.status).toBe(200);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'customer.update' } });
    expect(audit.before).toMatchObject({ name: 'PT Maju Jaya' });
    expect(audit.after).toMatchObject({ name: 'PT Maju Mundur' });
    expect((await request(app).get('/api/v1/customers/bukan-uuid').set(auth)).status).toBe(404);
    const found = await request(app).get('/api/v1/customers?q=mundur').set(auth);
    expect(found.body.data.total).toBe(1);
    const none = await request(app).get('/api/v1/customers?q=zzz').set(auth);
    expect(none.body.data.total).toBe(0);
  });
});

describe('Produk, kategori, lokasi', () => {
  beforeEach(resetDb);

  async function setup() {
    const { app } = createTestApp();
    const auth = { Authorization: `Bearer ${await loginAs(app, 'ADMIN')}` };
    const category = (await request(app).post('/api/v1/categories').set(auth).send({ name: 'LED' }))
      .body.data;
    return { app, auth, category };
  }
  const product = (categoryId: string) => ({
    name: 'LED Panel',
    sku: 'LED-001',
    categoryId,
    pricingUnit: 'PCS',
    unitLabel: 'panel',
    price: 150000,
    deposit: 50000,
  });

  it('admin membuat produk dengan harga dan deposit integer', async () => {
    const { app, auth, category } = await setup();
    const res = await request(app).post('/api/v1/products').set(auth).send(product(category.id));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      price: 150000,
      deposit: 50000,
      pricingUnit: 'PCS',
      active: true,
    });
    expect(res.body.data.category.name).toBe('LED');
    expect(await db.auditLog.count({ where: { action: 'product.create' } })).toBe(1);
  });

  it('validasi: harga desimal/negatif, satuan salah, kategori tak ada, SKU ganda', async () => {
    const { app, auth, category } = await setup();
    const post = (body: object) => request(app).post('/api/v1/products').set(auth).send(body);
    expect((await post({ ...product(category.id), price: 1.5 })).status).toBe(400);
    expect((await post({ ...product(category.id), deposit: -1 })).status).toBe(400);
    expect((await post({ ...product(category.id), pricingUnit: 'METER' })).status).toBe(400);
    const missing = await post(product('00000000-0000-4000-8000-000000000000'));
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('INVALID_REFERENCE');
    expect((await post(product(category.id))).status).toBe(201);
    const dup = await post(product(category.id));
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE');
  });

  it('update produk dan toggle active', async () => {
    const { app, auth, category } = await setup();
    const created = (
      await request(app).post('/api/v1/products').set(auth).send(product(category.id))
    ).body.data;
    const res = await request(app)
      .put(`/api/v1/products/${created.id}`)
      .set(auth)
      .send({ ...product(category.id), pricingUnit: 'PACKAGE', price: 900000, active: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ pricingUnit: 'PACKAGE', price: 900000, active: false });
  });

  it('kategori yang dipakai produk tidak bisa dihapus; yang kosong bisa', async () => {
    const { app, auth, category } = await setup();
    await request(app).post('/api/v1/products').set(auth).send(product(category.id));
    const blocked = await request(app).delete(`/api/v1/categories/${category.id}`).set(auth);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('CATEGORY_IN_USE');
    const empty = (await request(app).post('/api/v1/categories').set(auth).send({ name: 'Kosong' }))
      .body.data;
    expect((await request(app).delete(`/api/v1/categories/${empty.id}`).set(auth)).status).toBe(
      200,
    );
  });

  it('lokasi: buat, ubah, nonaktifkan', async () => {
    const { app, auth } = await setup();
    const loc = (
      await request(app).post('/api/v1/locations').set(auth).send({ name: 'Gudang Utama' })
    ).body.data;
    expect(loc).toMatchObject({ name: 'Gudang Utama', active: true });
    const upd = await request(app)
      .put(`/api/v1/locations/${loc.id}`)
      .set(auth)
      .send({ name: 'Gudang Utama', address: 'Jl. A', active: false });
    expect(upd.body.data).toMatchObject({ address: 'Jl. A', active: false });
    expect((await request(app).get('/api/v1/locations').set(auth)).body.data).toHaveLength(1);
  });

  it('audit log tidak menyimpan password hash', async () => {
    const { app, auth } = await setup();
    const res = await request(app).post('/api/v1/users').set(auth).send({
      name: 'Gudang',
      email: 'GUDANG@Test.Local',
      password: 'Password123!',
      role: 'WAREHOUSE',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe('gudang@test.local');
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'user.create' } });
    expect(JSON.stringify(audit.after)).not.toMatch(/passwordHash|Password123/);
  });
});
