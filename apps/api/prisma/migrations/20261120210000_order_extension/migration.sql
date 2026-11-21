-- Perpanjangan sewa (permintaan owner, 20 Nov 2026). Aditif. Append-only; invoice tambahan terbit terpisah.
CREATE TABLE "order_extensions" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "previous_end_date" DATE NOT NULL,
  "new_end_date" DATE NOT NULL,
  "extra_days" INTEGER NOT NULL,
  "amount" BIGINT NOT NULL,
  "invoice_id" UUID,
  "note" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_extensions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_extensions_extra_days_check" CHECK ("extra_days" > 0 AND "new_end_date" > "previous_end_date")
);
CREATE INDEX "order_extensions_order_id_created_at_idx" ON "order_extensions"("order_id", "created_at");
ALTER TABLE "order_extensions" ADD CONSTRAINT "order_extensions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invoice perpanjangan: jenis invoice. Satu invoice ISSUED per pesanan kini berlaku untuk invoice utama (BASE);
-- invoice EXTENSION boleh lebih dari satu. Baris lama otomatis BASE.
CREATE TYPE "InvoiceKind" AS ENUM ('BASE', 'EXTENSION');
ALTER TABLE "invoices" ADD COLUMN "kind" "InvoiceKind" NOT NULL DEFAULT 'BASE';
DROP INDEX "invoices_order_active_unique";
CREATE UNIQUE INDEX "invoices_order_active_unique" ON "invoices"("order_id") WHERE "status" = 'ISSUED' AND "kind" = 'BASE';

-- Rollback (hanya bila tidak ada invoice EXTENSION): DROP INDEX "invoices_order_active_unique"; CREATE UNIQUE INDEX "invoices_order_active_unique" ON "invoices"("order_id") WHERE "status" = 'ISSUED'; ALTER TABLE "invoices" DROP COLUMN "kind"; DROP TYPE "InvoiceKind"; DROP TABLE "order_extensions";
