-- Kebijakan pembayaran (keputusan owner 19 Nov 2026): tanpa deposit; barang keluar wajib DP minimum.
-- Aditif. `app_settings` menyimpan pengaturan kunci-nilai (mis. persen DP minimum); `orders.dp_waived_*`
-- mencatat izin Owner untuk mengeluarkan barang tanpa DP (beserta alasan; juga masuk audit_logs).
CREATE TABLE "app_settings" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updated_by" UUID,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "orders"
  ADD COLUMN "dp_waived_at" TIMESTAMPTZ(3),
  ADD COLUMN "dp_waived_by" UUID,
  ADD COLUMN "dp_waive_reason" TEXT;

-- Rollback: ALTER TABLE "orders" DROP COLUMN "dp_waived_at", DROP COLUMN "dp_waived_by", DROP COLUMN "dp_waive_reason"; DROP TABLE "app_settings";
