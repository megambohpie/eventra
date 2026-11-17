-- Token acak pada dokumen serah-terima: dicetak sebagai QR di surat jalan agar tim lapangan cukup
-- memindai untuk melapor kerusakan aset pada dokumen itu. Token tidak memuat informasi sensitif.
-- Aditif; default dievaluasi per baris sehingga dokumen lama ikut mendapat token.
ALTER TABLE "handover_documents"
  ADD COLUMN "report_token" TEXT NOT NULL
  DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
CREATE UNIQUE INDEX "handover_documents_report_token_key" ON "handover_documents"("report_token");

-- Rollback: DROP INDEX "handover_documents_report_token_key"; ALTER TABLE "handover_documents" DROP COLUMN "report_token";
