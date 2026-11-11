# Eventra — Petunjuk untuk Agen Coding

Dokumen ini ditujukan untuk manusia, Codex, Claude Code, dan agen coding lain.

## Baca Sebelum Bekerja

1. Baca `PRD.md` untuk kebutuhan bisnis.
2. Baca `TECHNICAL_SPEC.md` untuk arsitektur dan invarian.
3. Baca `WORK_QUEUE.md`; pilih satu fase/item yang disetujui saja.
4. Periksa state repository dan perubahan yang sudah ada sebelum mengedit.

## Batasan Utama

- Fokus produk adalah kontrol aset rental untuk owner.
- Gunakan TypeScript dan JavaScript ecosystem: React web, React Native mobile, Node.js API.
- Semua HTTP frontend memakai Axios client bersama; jangan memakai `fetch` langsung.
- Web wajib menggunakan DaisyUI/Tailwind untuk UI. Jangan membuat CSS kustom atau komponen visual mentah bila DaisyUI menyediakan padanannya.
- React Native tidak mendukung DaisyUI; gunakan komponen native dengan token/pola UI yang konsisten.
- Jangan menyimpan rahasia, token, password, atau data produksi pada repository.
- Jangan mengubah data historis aset, scan, pembayaran, atau dokumen bertanda tangan secara destruktif. Gunakan event revisi/koreksi yang dapat diaudit.

## Prosedur Kerja

1. Lakukan discovery read-only dan ringkas temuan, scope, risiko, serta file yang diperkirakan berubah.
2. Kerjakan satu item work queue dengan perubahan terkecil yang memenuhi acceptance criteria.
3. Tulis/ubah test yang relevan; jalankan lint, typecheck, test, dan build yang tersedia.
4. Laporkan file berubah, hasil verifikasi aktual, asumsi, dan pekerjaan yang belum dilakukan.
5. Jangan memulai fase berikutnya, melakukan deploy, push, mengubah kredensial, atau menghapus data tanpa instruksi eksplisit.

## Invarian yang Tidak Boleh Dilanggar

- Tidak ada overbooking: alokasi stok dikonfirmasi atomik per tanggal.
- QR hanya token aman; tidak berisi informasi sensitif.
- Aset servis/rusak/karantina tidak bisa dialokasikan.
- Barang keluar/kembali harus dicocokkan dengan pick list dan dibuktikan dengan scan event.
- Insiden kerusakan harus menerima 1–5 foto pada backend.
- Pendapatan diterima berbeda dari piutang belum dibayar.
- Dokumen serah-terima yang ditandatangani tidak boleh diubah; buat revisi baru.

## Definition of Done

Item dianggap selesai hanya bila acceptance criteria di `WORK_QUEUE.md` terpenuhi, test relevan lulus, perubahan aman untuk RBAC/audit, dan bukti verifikasi dilaporkan. Jangan mengklaim test lulus bila tidak dijalankan.
