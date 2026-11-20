-- Penyewa/PIC menyerahkan aset rusak untuk dikembalikan lebih awal; gudang lalu menerimanya (scan).
-- Aditif; mencatat permintaan (waktu, pelaku, catatan). Penerimaan tetap tercatat di pick_list_items.
ALTER TABLE "replacement_tasks"
  ADD COLUMN "old_return_requested_at" TIMESTAMPTZ(3),
  ADD COLUMN "old_return_requested_by" UUID,
  ADD COLUMN "old_return_note" TEXT;

-- Rollback: ALTER TABLE "replacement_tasks" DROP COLUMN "old_return_requested_at", DROP COLUMN "old_return_requested_by", DROP COLUMN "old_return_note";
