-- Harga negosiasi dan borongan per pesanan. Aditif; pesanan lama tetap LINE dengan harga lama.
CREATE TYPE "OrderPricingMode" AS ENUM ('LINE', 'LUMP');

ALTER TABLE "orders"
  ADD COLUMN "pricing_mode" "OrderPricingMode" NOT NULL DEFAULT 'LINE',
  ADD COLUMN "lump_total" BIGINT,
  ADD CONSTRAINT "orders_lump_total_check" CHECK (
    ("pricing_mode" = 'LUMP' AND "lump_total" IS NOT NULL AND "lump_total" >= 0)
    OR ("pricing_mode" = 'LINE' AND "lump_total" IS NULL)
  );

ALTER TABLE "order_items" ADD COLUMN "list_price" BIGINT NOT NULL DEFAULT 0;
-- Pesanan lama tidak punya pembanding terpisah: snapshot harga lama dianggap harga default.
UPDATE "order_items" SET "list_price" = "unit_price";

-- Rollback: ALTER TABLE "order_items" DROP COLUMN "list_price";
--           ALTER TABLE "orders" DROP CONSTRAINT "orders_lump_total_check", DROP COLUMN "lump_total", DROP COLUMN "pricing_mode";
--           DROP TYPE "OrderPricingMode";
