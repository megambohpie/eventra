# Eventra — PRD Work Queue

**Cara pakai:** kerjakan berurutan. Satu item hanya boleh `Done` bila acceptance criteria dan verifikasi di bawahnya terpenuhi. Jangan memulai fase berikutnya tanpa persetujuan owner manusia terhadap hasil fase sebelumnya.

## Status

| Fase | Status | Fokus |
| --- | --- | --- |
| 00 | Done | Foundation dan standar proyek |
| 01 | Done | Auth, RBAC, master data |
| 02 | Done | Aset dan QR lifecycle |
| 03 | Done | Ketersediaan, paket, pesanan |
| 04 | Done | Gudang, scan, dan PDF |
| 05 | Done | Insiden, servis, penggantian |
| 06 | Todo | Dashboard owner dan keuangan |
| 07 | Todo | Mobile operasional |
| 08 | Todo | Hardening dan rilis |

## Definition of Ready untuk Setiap Item

- Referensi PRD/technical spec jelas.
- Dependency sudah selesai atau disepakati mock-nya.
- Perubahan schema/API/UI dan acceptance criteria disebutkan.
- Tidak ada keputusan bisnis yang belum dapat dijawab tanpa menebak.

## Fase 00 — Foundation dan Standar Proyek

- [x] Buat monorepo `apps/web`, `apps/mobile`, `apps/api`, `packages/shared`, dan `packages/api-client`.
- [x] Konfigurasi TypeScript strict, ESLint, Prettier, env validation, dan command lint/typecheck/test/build.
- [x] Setup React/Vite web dengan Tailwind dan DaisyUI; buat tema serta layout dasar memakai DaisyUI.
- [x] Setup Express API, Prisma, PostgreSQL, health endpoint, error handler, dan migrasi awal.
- [x] Setup React Native/Expo dan API client Axios bersama.
- [x] Standar FE web: komponen bersama (`Button` dengan loading, `Badge`, `Icon` MDI), satu layout global, dark/light mode, i18n EN/ID, dan notifikasi error (toast) otomatis dari client Axios.
- [x] Terapkan branding FE (`BRAND_GUIDE.md`): web memakai `eventra-theme.css` (`eventra-light`/`eventra-dark`) sebagai satu-satunya token, komponen `Logo`/`LogoIcon`/`Loading`, favicon `eventra-icon.svg`; mobile memakai token dan logo yang sama via `expo-image`.
- [x] Setup Turborepo di atas pnpm workspaces (`turbo.json`, cache lint/typecheck/test/build).

**Selesai bila:** semua aplikasi build, API terhubung ke DB dev, dan CI lokal lulus lint/typecheck/test/build.

## Fase 01 — Identity, RBAC, dan Master Data

- [x] Schema user, role, permission, customer, kategori, produk, dan lokasi.
- [x] Login, refresh/logout, reset password, route guard, dan capability middleware.
- [x] CRUD pelanggan. Keputusan owner: PIC tidak disimpan di pelanggan; PIC penyewa ditunjuk per pesanan (pihak rental atau customer) pada Fase 03 (`order_pics`), dan wajib ada sebelum pesanan diajukan.
- [x] CRUD produk dengan harga per pcs/paket dan deposit.
- [x] UI web seluruhnya menggunakan DaisyUI; Axios central client termasuk error/auth interceptor.
- [x] Tambahan di luar daftar: `GET/POST /users` (capability `user.read`/`user.manage`), seed admin pertama (`pnpm db:seed`), halaman web login/lupa-reset password, pelanggan, produk, dan kategori/lokasi.

**Selesai bila:** user tak berizin ditolak API dan UI; admin dapat membuat pelanggan dan produk; test izin serta validasi lulus.

## Fase 02 — Aset, QR, dan Riwayat Kondisi

- [x] Schema aset, pembelian, kondisi, lokasi, status event, dan audit log.
- [x] CRUD aset beserta tanggal beli, harga beli, serial, pemasok, kondisi awal, dan QR token.
- [x] Penerimaan stok/aset dari pembelian, transfer, hibah, titipan, produksi, atau sumber lain; rekam asal, dokumen, penerima, jumlah, dan biaya perolehan opsional.
- [x] Generate/cetak QR PDF/label dan halaman detail riwayat aset.
- [x] API pemindaian QR aman serta status aset; data sensitif harga beli dibatasi.
- [x] Dashboard/list aset dengan filter status, kondisi, lokasi, dan aset perlu perhatian.
- [x] Tambahan di luar daftar: keputusan desain Fase 02 — tidak ada hapus aset (pensiun = status `RETIRED`, final); aset rusak yang tersedia otomatis masuk karantina; transisi status operasional (RESERVED…RETURN_PENDING) baru terjadi lewat alur pesanan/scan Fase 03–04; penomoran `AST-######` dan `RCV-YYYY-######` dari sequence Postgres; capability baru `asset.read/write/cost.read/status` dan `receipt.read/write`.

**Selesai bila:** stok/aset dapat diterima dari sumber yang dipilih, aset per-unit memperoleh QR unik, dan riwayatnya memperlihatkan asal serta perubahan kondisi/status tanpa data sensitif bocor.

## Fase 03 — Paket, Ketersediaan, dan Pesanan

- [x] Schema bundle/konversi serta order, item, quote, allocation, dan hold.
- [x] Konfigurasi `1 satuan sewa → N aset fisik` (contoh 1 meter → 4 panel).
- [x] API cek ketersediaan per tanggal, beserta jumlah maksimum yang tersedia.
- [x] Transaksi atomic confirm order; release allocation saat batal/hold kadaluarsa.
- [x] Calendar web stok keluar/kembali per tanggal dan detail klik tanggal.
- [x] Manajemen PIC penyewa, gudang keluar/kembali, dan PIC lapangan (owner/penyewa/pihak ketiga).
- [x] Tambahan di luar daftar: alur status pesanan (submit → quote → hold → confirm, reject, cancel, schedule) dengan riwayat status; penawaran versi append-only; UI web Pesanan/Detail/Kalender (+ tab ketersediaan stok) dan modal Komposisi produk; capability `order.read/write/approve`, `availability.read`; `user.read` untuk koordinator; validasi telepon hanya angka (`phoneSchema`) di backend dan input web.

**Selesai bila:** skenario stok 30, booking tanggal 8–9 sebanyak 15, lalu request 7–8 hanya mengizinkan 15; test konkurensi membuktikan tidak ada overbooking.

## Fase 04 — Gudang, Scan, dan Dokumen Serah-Terima

- [x] Schema pick list, item aset, scan event, handover document, dan signature.
- [x] Gudang memilih aset spesifik untuk pesanan dan scan saat persiapan.
- [x] Verifikasi scan akhir sebelum keluar; blokir bila tidak sesuai pick list.
- [x] Scan pengembalian, kondisi/foto, selisih, serta transisi aset.
- [x] Buat PDF surat jalan/berita acara keluar dan kembali, nomor unik, cetak, dan tanda tangan PIC.
- [x] Dokumen immutable setelah ditandatangani; revisi memakai berita acara/versi baru.

- [x] Tambahan di luar daftar: pick list per pesanan (kebutuhan fisik dari konversi paket), scan pilih (QR/kode aset manual) lalu verifikasi akhir wajib QR; checkout memblokir bila tidak sesuai pick list dan hanya dari pesanan SCHEDULED; scan pengembalian dengan kondisi, catatan, lokasi, dan 1–5 foto; selisih ditandai MISSING (aset ISSUE_ON_SITE, tidak bisa dialokasikan) dengan konfirmasi eksplisit; scan terlambat + revisi berita acara; tanda tangan PIC (canvas PNG) pada dokumen; revisi = versi baru bernomor sama; trigger DB melarang ubah/hapus scan event, dokumen, dan tanda tangan; pembatalan pesanan melepas aset terpilih; capability baru `warehouse.read/write` dan `handover.sign`; UI `/warehouse` dan `/warehouse/pick-lists/:id`.

**Selesai bila:** scan salah/kurang memblokir serah-terima; PDF berisi asset code, kondisi, waktu, dan penandatangan; semua aktivitas memiliki audit log.

## Fase 05 — Insiden, Servis, dan Aset Pengganti

- [x] Schema insiden, foto (validasi 1–5), service ticket, replacement task.
- [x] PIC lapangan scan aset rusak, memilih urgensi, mengisi deskripsi, dan unggah 1–5 foto.
- [x] Notifikasi/admin review dengan keputusan perbaikan, teknisi, tolak, atau penggantian.
- [x] Pick list serta scan aset pengganti keluar dan scan diterima PIC lapangan.
- [x] Hubungkan aset rusak/pengganti ke insiden dan catat tiket servis.

- [x] Tambahan di luar daftar: insiden berstatus DRAFT → REPORTED (wajib 1–5 foto, ditegakkan API dan trigger DB), aset ditandai ISSUE_ON_SITE/DAMAGED saat laporan dikirim; keputusan admin (panduan, teknisi + tiket servis otomatis, tolak dengan alasan, penggantian) dan penutupan di lokasi; tugas penggantian (pilih → verifikasi QR → kirim → diterima PIC lapangan) dengan scan ditolak tercatat; aset pengganti masuk daftar aktif pesanan; tiket servis (buka/mulai/selesai dengan hasil pemeriksaan/batal) dengan biaya hanya untuk asset.cost.read; aset dengan insiden/tiket terbuka dikarantina saat kembali dan tidak bisa AVAILABLE manual; notifikasi dalam aplikasi (lonceng); capability baru incident.read/report/review, service.read/write, replacement.receive; UI /incidents, /replacements, /service-tickets.

**Selesai bila:** alur kerusakan sampai penggantian dapat diuji end-to-end dan aset rusak tidak kembali ke stok tersedia sebelum lolos pemeriksaan.

## Fase 06 — Dashboard Owner dan Keuangan

- [ ] Dashboard kesehatan aset: tersedia, keluar, on-site, rusak, servis, pensiun, dan aset tanpa update.
- [ ] Dashboard pergerakan barang per tanggal dengan drill-down pesanan, jumlah, lokasi, dan PIC.
- [ ] Invoice, payment, pembayaran manual/gateway adapter, dan pengingat tagihan.
- [ ] Laporan pendapatan diterima, pesanan berjalan, piutang, jatuh tempo, dan keterlambatan.
- [ ] Detail aset: umur, harga beli, jumlah sewa, hari pakai, jumlah/biaya servis, dan insiden.

**Selesai bila:** pendapatan hanya menghitung pembayaran yang diterima dan piutang menampilkan sisa tagihan aktual per invoice.

## Fase 07 — Mobile Operasional

- [ ] Login, daftar tugas, detail tugas, pemindai QR, dan offline/error state dasar.
- [ ] Scan keluar/terima/kembali sesuai permission dan API yang sama dengan web.
- [ ] Laporan insiden dengan foto 1–5 dan status tiket.
- [ ] Konfirmasi penerimaan aset pengganti serta tampilan dokumen terkait.

**Selesai bila:** skenario gudang dan PIC lapangan dapat menjalankan proses scan lengkap dari perangkat mobile uji.

## Fase 08 — Hardening dan Rilis

- [ ] Uji keamanan akses, upload, QR token, rate limit, dan audit log.
- [ ] Uji backup/restore, observability, error monitoring, dan job hold expiry.
- [ ] Uji beban untuk cek ketersediaan/konfirmasi pesanan serentak.
- [ ] E2E smoke test seluruh alur kritis serta UAT owner.
- [ ] Runbook produksi, env checklist, rollback migration, dan rencana peluncuran.

**Selesai bila:** semua test wajib hijau, UAT owner disetujui, backup restore berhasil, dan runbook tersedia.

## Backlog Setelah MVP

- [ ] GPS real-time kendaraan/aset.
- [ ] Multi-cabang dan transfer antar gudang.
- [ ] Penyusutan aset dan laporan laba per aset.
- [ ] Integrasi WhatsApp/push notification lengkap.
- [ ] Multi-vendor/marketplace.
