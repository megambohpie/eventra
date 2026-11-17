-- Nominal deposit hasil negosiasi per pesanan. Aditif; NULL = deposit default (jumlah deposit per unit).
ALTER TABLE "orders"
  ADD COLUMN "deposit_override" BIGINT,
  ADD CONSTRAINT "orders_deposit_override_check" CHECK ("deposit_override" IS NULL OR "deposit_override" >= 0);

-- Rollback: ALTER TABLE "orders" DROP CONSTRAINT "orders_deposit_override_check", DROP COLUMN "deposit_override";
