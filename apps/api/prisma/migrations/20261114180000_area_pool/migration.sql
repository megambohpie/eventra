-- Kelompok "per meter" (mis. Videotron per m²): pesanan dalam m², stok = total luas kabinet anggota.
-- Gudang bebas memilih kabinet (50x50 / 100x50 dst.) selama total luas pas dengan pesanan.
-- Aksesori tambahan (include) dapat ditambahkan gudang di pick list di luar kebutuhan pesanan. Aditif.
ALTER TYPE "StockMode" ADD VALUE 'AREA_POOL';

ALTER TABLE "products" ADD COLUMN "area_pool_id" UUID;
ALTER TABLE "products" ADD CONSTRAINT "products_area_pool_id_fkey"
  FOREIGN KEY ("area_pool_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "products_area_pool_id_idx" ON "products"("area_pool_id");

ALTER TABLE "pick_list_lines"
  ADD COLUMN "area_pool" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "extra" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pick_list_items" ADD COLUMN "extra" BOOLEAN NOT NULL DEFAULT false;

-- Rollback: ALTER TABLE pick_list_items DROP COLUMN extra; ALTER TABLE pick_list_lines DROP COLUMN area_pool, DROP COLUMN extra; DROP INDEX products_area_pool_id_idx; ALTER TABLE products DROP CONSTRAINT products_area_pool_id_fkey, DROP COLUMN area_pool_id; (nilai enum StockMode AREA_POOL tidak dapat dihapus; biarkan tidak terpakai)
