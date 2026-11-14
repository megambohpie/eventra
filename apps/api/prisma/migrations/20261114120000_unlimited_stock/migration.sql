-- Barang stok tidak terbatas (mis. kabel jumper): tanpa aset/QR per unit, tidak membatasi pesanan,
-- dibuktikan keluar/kembali dengan event hitung jumlah. Aditif.
CREATE TYPE "StockMode" AS ENUM ('TRACKED', 'UNLIMITED');

ALTER TABLE "products" ADD COLUMN "stock_mode" "StockMode" NOT NULL DEFAULT 'TRACKED';

ALTER TABLE "pick_list_lines"
  ADD COLUMN "unlimited" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "packed_qty" INTEGER,
  ADD COLUMN "returned_qty" INTEGER;

ALTER TABLE "pick_list_lines" ADD CONSTRAINT "pick_list_lines_counts_check"
  CHECK (("packed_qty" IS NULL OR "packed_qty" >= 0)
    AND ("returned_qty" IS NULL OR ("returned_qty" >= 0 AND "packed_qty" IS NOT NULL AND "returned_qty" <= "packed_qty")));

ALTER TYPE "ScanAction" ADD VALUE 'COUNT_OUT';
ALTER TYPE "ScanAction" ADD VALUE 'COUNT_RETURN';

ALTER TABLE "scan_events" ADD COLUMN "product_id" UUID, ADD COLUMN "quantity" INTEGER;
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rollback: ALTER TABLE scan_events DROP CONSTRAINT scan_events_product_id_fkey, DROP COLUMN product_id, DROP COLUMN quantity; ALTER TABLE pick_list_lines DROP CONSTRAINT pick_list_lines_counts_check, DROP COLUMN unlimited, DROP COLUMN packed_qty, DROP COLUMN returned_qty; ALTER TABLE products DROP COLUMN stock_mode; DROP TYPE "StockMode"; (nilai enum ScanAction COUNT_OUT/COUNT_RETURN tidak dapat dihapus dari enum; biarkan tidak terpakai)
