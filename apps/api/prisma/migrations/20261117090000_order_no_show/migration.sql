-- Pesanan tidak diambil: batas barang keluar = akhir hari sewa pertama (24:00 WIB). Lewat batas tanpa
-- checkout, pesanan dibatalkan otomatis dan deposit hangus. Aditif; NULL = bukan no-show.
ALTER TABLE "orders" ADD COLUMN "no_show_at" TIMESTAMPTZ(3);

-- Rollback: ALTER TABLE "orders" DROP COLUMN "no_show_at";
