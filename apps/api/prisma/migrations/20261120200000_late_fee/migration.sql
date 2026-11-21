-- Denda keterlambatan pengembalian (keputusan owner 20 Nov 2026). Aditif. Kebijakan (aktif/persen/toleransi)
-- disimpan di `app_settings` (kunci `payment.lateFee`), default nonaktif. Satu denda per pick list;
-- nominal tidak diubah, penghapusan = status WAIVED + alasan.
CREATE TYPE "LateFeeStatus" AS ENUM ('ACTIVE', 'WAIVED');

CREATE TABLE "late_fees" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "pick_list_id" UUID NOT NULL,
  "days_late" INTEGER NOT NULL,
  "chargeable_days" INTEGER NOT NULL,
  "percent_per_day" DECIMAL(5,2) NOT NULL,
  "grace_days" INTEGER NOT NULL,
  "base_amount" BIGINT NOT NULL,
  "amount" BIGINT NOT NULL,
  "status" "LateFeeStatus" NOT NULL DEFAULT 'ACTIVE',
  "returned_on" DATE NOT NULL,
  "waived_at" TIMESTAMPTZ(3),
  "waived_by" UUID,
  "waive_reason" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "late_fees_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "late_fees_pick_list_id_key" ON "late_fees"("pick_list_id");
CREATE INDEX "late_fees_order_id_idx" ON "late_fees"("order_id");
ALTER TABLE "late_fees" ADD CONSTRAINT "late_fees_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "late_fees" ADD CONSTRAINT "late_fees_pick_list_id_fkey" FOREIGN KEY ("pick_list_id") REFERENCES "pick_lists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rollback: DROP TABLE "late_fees"; DROP TYPE "LateFeeStatus"; DELETE FROM "app_settings" WHERE "key" = 'payment.lateFee';
