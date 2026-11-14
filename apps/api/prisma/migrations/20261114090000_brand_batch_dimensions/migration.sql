-- Merek, label batch, dan ukuran kabinet (aditif; semua kolom opsional).
ALTER TABLE "products" ADD COLUMN "width_cm" INTEGER, ADD COLUMN "height_cm" INTEGER;
ALTER TABLE "assets" ADD COLUMN "brand" TEXT, ADD COLUMN "batch_label" TEXT;
ALTER TABLE "stock_receipts" ADD COLUMN "batch_label" TEXT;
ALTER TABLE "stock_receipt_items" ADD COLUMN "brand" TEXT;

ALTER TABLE "products" ADD CONSTRAINT "products_dimensions_check"
  CHECK (("width_cm" IS NULL) = ("height_cm" IS NULL)
    AND ("width_cm" IS NULL OR ("width_cm" > 0 AND "height_cm" > 0)));

-- Rollback: ALTER TABLE products DROP CONSTRAINT products_dimensions_check, DROP COLUMN width_cm, DROP COLUMN height_cm; ALTER TABLE assets DROP COLUMN brand, DROP COLUMN batch_label; ALTER TABLE stock_receipts DROP COLUMN batch_label; ALTER TABLE stock_receipt_items DROP COLUMN brand;
