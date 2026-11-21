-- Denda keterlambatan ditagih lewat invoice terpisah (kind LATE_FEE) sehingga otomatis masuk
-- pembayaran/piutang. Aditif. Indeks unik invoice aktif per pesanan hanya untuk kind BASE (sudah).
ALTER TYPE "InvoiceKind" ADD VALUE 'LATE_FEE';
ALTER TABLE "late_fees" ADD COLUMN "invoice_id" UUID;
CREATE UNIQUE INDEX "late_fees_invoice_id_key" ON "late_fees"("invoice_id");
ALTER TABLE "late_fees" ADD CONSTRAINT "late_fees_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rollback: ALTER TABLE "late_fees" DROP COLUMN "invoice_id"; (nilai enum LATE_FEE tidak dapat dihapus; biarkan)
