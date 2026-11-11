# Eventra — Petunjuk untuk Agen Coding

Dokumen ini ditujukan untuk manusia, Codex, Claude Code, dan agen coding lain.

## Baca Sebelum Bekerja

1. Baca `HANDOFF.md` untuk kondisi proyek terakhir dan agar pekerjaan tidak diulang.
2. Baca `PRD.md` untuk kebutuhan bisnis.
3. Baca `TECHNICAL_SPEC.md` untuk arsitektur dan invarian.
4. Baca `WORK_QUEUE.md`; pilih satu fase/item yang disetujui saja.
5. Periksa state repository dan perubahan yang sudah ada sebelum mengedit.

## Batasan Utama

- Fokus produk adalah kontrol aset rental untuk owner.
- Gunakan TypeScript dan JavaScript ecosystem: React web, React Native mobile, Node.js API.
- Semua HTTP frontend memakai Axios client bersama; jangan memakai `fetch` langsung.
- Web wajib menggunakan DaisyUI/Tailwind untuk UI. Jangan membuat CSS kustom atau komponen visual mentah bila DaisyUI menyediakan padanannya.
- Seluruh frontend wajib memakai warna asli `eventra-logo-v5.svg` pada light maupun dark mode. Pada dark mode, tempatkan logo di surface terang; yang boleh berubah hanya token UI dari `eventra-theme.css`. Gunakan `eventra-icon.svg` untuk favicon/loading. Jangan menulis hex warna brand langsung di komponen.
- React Native tidak mendukung DaisyUI; gunakan komponen native dengan token/pola UI yang konsisten.
- Jangan menyimpan rahasia, token, password, atau data produksi pada repository.
- Jangan mengubah data historis aset, scan, pembayaran, atau dokumen bertanda tangan secara destruktif. Gunakan event revisi/koreksi yang dapat diaudit.

## Aturan Frontend Web (`apps/web`)

- **Komponen bersama:** sebelum membuat UI, cari dulu di `apps/web/src/components/`. Bila sudah ada komponen yang sama/serupa, wajib dipakai ulang atau diperluas; buat komponen baru hanya bila belum ada. Komponen generik ada di `components/ui/` (`Button`, `Badge`, `Icon`, dst.).
- **Satu layout global:** semua halaman dirender di dalam `components/Layout.tsx` (navbar, konten, footer). Dilarang membuat layout/shell terpisah per halaman.
- **Ikon:** hanya Material Design Icons (`@mdi/js` lewat komponen `Icon`). Jangan memakai set ikon lain atau SVG inline manual.
- **Loading pada aksi:** setiap tombol aksi memakai `Button`. Tombol harus menampilkan spinner dan nonaktif selama aksi berjalan (`loading` atau `onClick` yang mengembalikan Promise).
- **Notifikasi error:** setiap error (API, jaringan, atau tak tertangani) wajib tampil lewat komponen `NotificationHost` (toast DaisyUI) dengan `notify`/`notifyError` dari `lib/notifications.ts`. Error API otomatis dinotifikasi oleh client Axios (`onError`); jangan membuat alert/dialog error sendiri per halaman. Pesan harus diterjemahkan (`errors.<CODE>`).
- **Tema:** dukung light dan dark (`eventra` dan `eventra-dark`) lewat token DaisyUI; jangan hardcode warna.
- **Bahasa:** Inggris (`en`) dan Indonesia (`id`) lewat i18next. Semua teks tampil harus memakai kunci terjemahan di `src/i18n/locales/`; kunci `en` dan `id` harus identik (dijaga test).

## Prosedur Kerja

1. Lakukan discovery read-only dan ringkas temuan, scope, risiko, serta file yang diperkirakan berubah.
2. Kerjakan satu item work queue dengan perubahan terkecil yang memenuhi acceptance criteria.
3. Tulis/ubah test yang relevan; jalankan lint, typecheck, test, dan build yang tersedia.
4. Laporkan file berubah, hasil verifikasi aktual, asumsi, dan pekerjaan yang belum dilakukan.
5. **Segera setelah pekerjaan selesai dan terverifikasi, update `WORK_QUEUE.md`** (centang item, tambahkan item baru bila ada pekerjaan di luar daftar, perbarui tabel Status, dan sinkronkan status fase di blok data `WORK_QUEUE_STATUS.html`) sebelum melapor. Bila kode selesai, terverifikasi, dan berjalan, langsung tandai `Done`; review dilakukan sendiri oleh owner secara manual.
6. Jangan memulai fase berikutnya, melakukan deploy, push, mengubah kredensial, atau menghapus data tanpa instruksi eksplisit.
7. Setelah pekerjaan material selesai atau terblokir, perbarui `HANDOFF.md` dengan fakta, bukti verifikasi, keputusan, dan next step terbaru.

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
