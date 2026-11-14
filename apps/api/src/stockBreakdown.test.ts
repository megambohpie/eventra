import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type {
  AssetBatchDto,
  AssetDto,
  ProductDto,
  ReceiptDto,
  StockBreakdownDto,
} from '@eventra/shared';
import { createTestApp, db, loginAs, resetDb } from '../test/helpers';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const V1 = '/api/v1';

describe('Merek, batch, dan rekap stok (satu jenis barang, banyak pembelian/merek)', () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  async function setup() {
    const { app } = createTestApp();
    const admin = await loginAs(app, 'ADMIN');
    const category = await db.category.create({ data: { name: 'LED' } });
    const location = await db.location.create({ data: { name: 'Gudang Utama' } });
    const createProduct = async (name: string, widthCm?: number, heightCm?: number) => {
      const res = await request(app)
        .post(`${V1}/products`)
        .set(auth(admin))
        .send({
          name,
          categoryId: category.id,
          pricingUnit: 'PCS',
          unitLabel: 'kabinet',
          price: 100000,
          deposit: 0,
          ...(widthCm ? { widthCm, heightCm } : {}),
        });
      expect(res.status).toBe(201);
      return (res.body as { data: ProductDto }).data;
    };
    const receive = async (
      productId: string,
      quantity: number,
      brand: string,
      batchLabel: string,
      receivedDate: string,
    ) => {
      const draft = await request(app)
        .post(`${V1}/stock-receipts`)
        .set(auth(admin))
        .send({
          source: 'PURCHASE',
          supplier: 'Vendor',
          batchLabel,
          locationId: location.id,
          receivedDate,
          items: [{ productId, quantity, brand }],
        });
      expect(draft.status).toBe(201);
      const id = (draft.body as { data: ReceiptDto }).data.id;
      const done = await request(app).post(`${V1}/stock-receipts/${id}/receive`).set(auth(admin));
      expect(done.status).toBe(200);
      return (done.body as { data: ReceiptDto }).data;
    };
    return { app, admin, location, createProduct, receive };
  }

  it('ukuran produk: harus berpasangan dan tersimpan di DTO', async () => {
    const { app, admin, createProduct } = await setup();
    const p = await createProduct('LED P3.91 Outdoor 100x50', 100, 50);
    expect([p.widthCm, p.heightCm]).toEqual([100, 50]);
    const category = await db.category.findFirstOrThrow();
    const bad = await request(app).post(`${V1}/products`).set(auth(admin)).send({
      name: 'Tanpa tinggi',
      categoryId: category.id,
      pricingUnit: 'PCS',
      unitLabel: 'kabinet',
      price: 1,
      deposit: 0,
      widthCm: 100,
    });
    expect(bad.status).toBe(400);
  });

  it('merek dan label batch dari penerimaan menurun ke setiap unit aset', async () => {
    const { app, admin, createProduct, receive } = await setup();
    const p = await createProduct('LED P3.91 Outdoor 100x50', 100, 50);
    const receipt = await receive(p.id, 3, 'Dahua', 'Batch 1', '2026-01-10');
    expect(receipt.batchLabel).toBe('Batch 1');
    expect(receipt.items[0]?.brand).toBe('Dahua');
    const assets = await db.asset.findMany({ where: { productId: p.id } });
    expect(assets).toHaveLength(3);
    for (const a of assets) {
      expect([a.brand, a.batchLabel]).toEqual(['Dahua', 'Batch 1']);
    }
    const one = await request(app).get(`${V1}/assets/${assets[0]?.id}`).set(auth(admin));
    const dto = (one.body as { data: AssetDto }).data;
    expect([dto.brand, dto.batchLabel]).toEqual(['Dahua', 'Batch 1']);
  });

  it('rekap: satu barang dari beberapa pembelian dan merek, dengan total luas m²', async () => {
    const { app, admin, createProduct, receive } = await setup();
    const big = await createProduct('LED P3.91 Outdoor 100x50', 100, 50);
    const small = await createProduct('LED P3.91 Outdoor 50x50', 50, 50);
    const noSize = await createProduct('Kabel jumper POWER');
    await receive(big.id, 9, 'Dahua', 'Batch 1', '2026-01-10');
    await receive(big.id, 4, 'Dahua', 'Batch 3', '2026-03-10');
    await receive(big.id, 2, 'Cailiang', 'Batch 2', '2026-02-10');
    await receive(small.id, 4, 'Dahua', 'Batch 1', '2026-01-10');
    await receive(noSize.id, 5, 'Pabrikan', 'Batch 1', '2026-01-10');

    const res = await request(app).get(`${V1}/assets/breakdown`).set(auth(admin));
    expect(res.status).toBe(200);
    const data = (res.body as { data: StockBreakdownDto }).data;
    expect(data.totalQuantity).toBe(24);

    const row = (name: string, batch: string, brand: string) =>
      data.rows.find((r) => r.productName === name && r.batchLabel === batch && r.brand === brand);
    // 100x50 cm = 0,5 m² per kabinet: 9 × 0,5 = 4,5; 4 × 0,5 = 2
    expect(row('LED P3.91 Outdoor 100x50', 'Batch 1', 'Dahua')).toMatchObject({
      quantity: 9,
      areaM2: 4.5,
    });
    expect(row('LED P3.91 Outdoor 100x50', 'Batch 3', 'Dahua')).toMatchObject({
      quantity: 4,
      areaM2: 2,
    });
    expect(row('LED P3.91 Outdoor 100x50', 'Batch 2', 'Cailiang')?.quantity).toBe(2);
    // 50x50 cm = 0,25 m²
    expect(row('LED P3.91 Outdoor 50x50', 'Batch 1', 'Dahua')?.areaM2).toBe(1);
    expect(row('Kabel jumper POWER', 'Batch 1', 'Pabrikan')).toMatchObject({
      quantity: 5,
      areaM2: null,
    });

    // Unit pensiun tidak dihitung.
    const one = await db.asset.findFirstOrThrow({ where: { productId: small.id } });
    await db.asset.update({ where: { id: one.id }, data: { status: 'RETIRED' } });
    const after = await request(app).get(`${V1}/assets/breakdown`).set(auth(admin));
    expect((after.body as { data: StockBreakdownDto }).data.totalQuantity).toBe(23);
  });

  it('rincian kelompok memuat label batch dan sebaran merek', async () => {
    const { app, admin, createProduct, receive } = await setup();
    const p = await createProduct('LED P3.91 Outdoor 100x50', 100, 50);
    await receive(p.id, 3, 'Dahua', 'Batch 1', '2026-01-10');
    await receive(p.id, 2, 'Cailiang', 'Batch 2', '2026-01-10');
    const res = await request(app).get(`${V1}/assets/groups/${p.id}`).set(auth(admin));
    const [batch] = (res.body as { data: AssetBatchDto[] }).data;
    expect(batch?.quantity).toBe(5);
    expect([...(batch?.batchLabels ?? [])].sort()).toEqual(['Batch 1', 'Batch 2']);
    expect(batch?.brands).toEqual(
      expect.arrayContaining([
        { brand: 'Dahua', quantity: 3 },
        { brand: 'Cailiang', quantity: 2 },
      ]),
    );
  });

  it('RBAC: rekap butuh asset.read', async () => {
    const { app } = await setup();
    const field = await loginAs(app, 'FIELD_PIC');
    expect((await request(app).get(`${V1}/assets/breakdown`).set(auth(field))).status).toBe(403);
    expect((await request(app).get(`${V1}/assets/breakdown`)).status).toBe(401);
  });
});
