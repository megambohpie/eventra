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
| 06 | Done | Dashboard owner dan keuangan |
| 07 | Done | Mobile operasional |
| 08 | Done | Hardening dan rilis |
| 09 | Done | UX pesanan: POS dan kalender depan |

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

- [x] Dashboard kesehatan aset: tersedia, keluar, on-site, rusak, servis, pensiun, dan aset tanpa update.
- [x] Dashboard pergerakan barang per tanggal dengan drill-down pesanan, jumlah, lokasi, dan PIC.
- [x] Invoice, payment, pembayaran manual/gateway adapter, dan pengingat tagihan.
- [x] Laporan pendapatan diterima, pesanan berjalan, piutang, jatuh tempo, dan keterlambatan.
- [x] Detail aset: umur, harga beli, jumlah sewa, hari pakai, jumlah/biaya servis, dan insiden.

- [x] Tambahan di luar daftar: invoice per pesanan (snapshot sewa + deposit, satu invoice aktif per pesanan, void + terbit ulang); pembayaran dengan tujuan SEWA/DEPOSIT (hanya sewa yang SUCCEEDED menjadi pendapatan; deposit dilaporkan terpisah), metode tunai/transfer/gateway/lainnya (gateway PENDING sampai dikonfirmasi lewat `settlePayment`, titik masuk tunggal untuk konfirmasi manual maupun adapter gateway kelak), batas bayar per tujuan dengan kunci baris invoice, koreksi lewat void (baris tidak dihapus; trigger DB melarang hapus/ubah nominal); pengingat tagihan manual + job otomatis (jatuh tempo ≤ 3 hari atau terlambat, maks. 1 per 24 jam, notifikasi dalam aplikasi); status turunan Belum dibayar/Sebagian/Lunas/Terlambat; capability baru `finance.read/write`, `dashboard.read`; UI `/dashboard`, `/invoices`, `/invoices/:id`, `/finance`, metrik di detail aset.
- [x] Tambahan di luar daftar: Beranda dan Dashboard digabung menjadi satu halaman `/` (kalender tetap paling atas, lalu statistik/aset stale/peringkat lewat `components/dashboard/OwnerOverview`, pintasan, status API/DB); menu dan halaman `/dashboard` dihapus, rute lama dialihkan ke `/`; strip pergerakan 14 hari dihapus karena duplikat kalender.
- [x] Denda keterlambatan pengembalian, dapat diaktifkan/nonaktif Owner (permintaan owner, 20 Nov 2026): kebijakan di `app_settings` (`payment.lateFee`: aktif, persen per hari dari sewa, toleransi hari), **default nonaktif**, hanya Owner (`finance.policy`) lewat `GET/PUT /settings/late-fee-policy` + audit. Saat pengembalian dikonfirmasi (`/pick-lists/:id/return/complete`) dan kebijakan aktif, denda = sewa × persen × (hari terlambat − toleransi) dicatat di tabel baru `late_fees` (satu per pick list, tidak menggandakan saat penyelesaian ulang, snapshot kebijakan). Owner dapat menghapuskan dengan alasan (`POST /late-fees/:id/waive`, status WAIVED, nominal tidak diubah, audit). Web: badge + tombol **Denda** di halaman Invoice, panel denda di detail pesanan. Test: `shared/finance.test.ts` (computeLateFee), `warehouse.test.ts` (denda). **Penagihan (20 Nov 2026):** denda otomatis menerbitkan **invoice terpisah** (`invoices.kind = LATE_FEE`, tanpa deposit, jatuh tempo hari pengembalian; `late_fees.invoice_id`, migrasi `20261120220000_late_fee_invoice`) sehingga dapat dibayar lewat alur pembayaran biasa dan otomatis masuk saldo/piutang. Menghapuskan denda membatalkan (VOID) invoicenya; ditolak `INVOICE_HAS_PAYMENTS` bila sudah ada pembayaran aktif (void pembayaran dulu). **Belum:** laporan pendapatan belum memisahkan denda dari sewa; batas maksimum denda belum ada.
- [x] Perpanjangan sewa (permintaan owner, 20 Nov 2026): Owner/Admin (`order.approve`) memperpanjang pesanan CONFIRMED/SCHEDULED/IN_PROGRESS/ISSUE selama pick list belum RETURNED/RETURN_ISSUE (`POST /orders/:id/extend`, pratinjau `GET /orders/:id/extension-preview`, riwayat `GET /orders/:id/extensions`). Atomik dalam satu transaksi: kunci pick list + produk, cek stok **hanya hari tambahan** (tanpa overbooking; kurang → `INSUFFICIENT_STOCK` dan tidak ada perubahan), buat alokasi CONFIRMED, geser `end_date`, tambah `subtotal` (LINE: harga final × qty × hari tambahan; LUMP: biaya diisi manual dan menambah `lump_total`), catat di tabel append-only `order_extensions` + status event + audit. Biaya ditagih lewat **invoice tambahan terpisah** (`invoices.kind = EXTENSION`; invoice awal dan pembayarannya tidak disentuh); indeks unik "satu invoice ISSUED per pesanan" dipersempit ke `kind = BASE`. Web: tombol **Perpanjang sewa** + modal pratinjau (biaya, stok) di detail pesanan, riwayat perpanjangan, label "Invoice perpanjangan". Denda keterlambatan otomatis memakai tanggal selesai dan sewa terbaru. Test: `shared/orders.test.ts` (extensionDays), `warehouse.test.ts` (Perpanjangan sewa, 4 skenario). **Catatan:** DP minimum dihitung dari total sewa baru (invoice utama + perpanjangan); belum ada pemendekan/pembatalan perpanjangan.

**Selesai bila:** pendapatan hanya menghitung pembayaran yang diterima dan piutang menampilkan sisa tagihan aktual per invoice.

## Fase 07 — Mobile Operasional

- [x] Login, daftar tugas, detail tugas, pemindai QR, dan offline/error state dasar.
- [x] Scan keluar/terima/kembali sesuai permission dan API yang sama dengan web.
- [x] Laporan insiden dengan foto 1–5 dan status tiket.
- [x] Konfirmasi penerimaan aset pengganti serta tampilan dokumen terkait.

- [x] Tambahan di luar daftar: sesi di Keychain/Keystore (`expo-secure-store`, hanya refresh token; access token di memori) dengan refresh otomatis lewat client Axios bersama; "tugas saya" diturunkan dari API yang ada (pick list aktif, tugas penggantian, insiden terbuka) menurut capability tanpa endpoint baru; pemindai kamera (`expo-camera`) dengan gerbang cooldown anti-scan ganda dan input kode aset manual hanya untuk aksi yang mengizinkan (verifikasi/pengembalian/terima wajib QR); alur gudang (pilih → verifikasi → checkout, scan kembali + kondisi + foto, selesaikan pengembalian dengan konfirmasi selisih); penyiapan/kirim aset pengganti dan terima oleh PIC lapangan; lapor insiden (scan → deskripsi → 1–5 foto via kamera/galeri → kirim; draft dapat dilanjutkan); layar dokumen serah-terima baca-saja; banner offline dan aksi tulis dinonaktifkan saat offline (scan harus tervalidasi server, tidak ada antrean offline); `api-client` menerima `UploadFile` (Blob web atau byte React Native).

**Selesai bila:** skenario gudang dan PIC lapangan dapat menjalankan proses scan lengkap dari perangkat mobile uji.

## Fase 08 — Hardening dan Rilis

- [x] Uji keamanan akses, upload, QR token, rate limit, dan audit log.
- [x] Uji backup/restore, observability, error monitoring, dan job hold expiry.
- [x] Uji beban untuk cek ketersediaan/konfirmasi pesanan serentak.
- [x] E2E smoke test seluruh alur kritis serta UAT owner (smoke test otomatis selesai; lembar UAT owner siap di `RELEASE_PLAN.md` §3 — persetujuan UAT dilakukan owner secara manual).
- [x] Runbook produksi, env checklist, rollback migration, dan rencana peluncuran (`RUNBOOK.md`, `RELEASE_PLAN.md`).

- [x] Tambahan di luar daftar: batas laju di memori (login per IP+email dan per IP, refresh, reset password, global) dengan 429 + `Retry-After`; CORS allowlist (`CORS_ORIGINS`, wajib di production), `TRUST_PROXY`, validasi env production (tolak wildcard/secret contoh); header `Cache-Control: no-store`; request id (`x-request-id`) + access log JSON yang memakai template rute (token QR/reset tidak pernah masuk log); `ErrorReporter` tunggal untuk 500, job gagal, dan error proses; `JobMonitor` (guard anti-tumpang-tindih, status per job) + endpoint `/health/live` dan `/health/ready`; graceful shutdown; migrasi `hardening_append_only` (trigger append-only untuk `audit_logs`, `asset_status_events`, `order_status_events`); skrip `ops/backup.sh` + `ops/restore-verify.sh` (diuji nyata: dump → restore ke DB sementara → bandingkan 36 tabel, trigger, migrasi); test: `hardening.test.ts`, `load.test.ts`, `e2e.test.ts`.

**Selesai bila:** semua test wajib hijau, UAT owner disetujui, backup restore berhasil, dan runbook tersedia.

## Fase 09 — UX Pesanan: POS dan Kalender Depan (permintaan owner, 13 Nov 2026)

- [x] Halaman depan (`/`) menampilkan kalender pesanan: tiap pesanan = blok panjang dari tanggal mulai sampai selesai (dipotong per minggu), berisi nama pemesan; klik blok → detail pesanan; tombol **+** pada tanggal hari ini/mendatang → pesanan baru dengan tanggal terisi.
- [x] Pesanan baru/ubah draft berbentuk POS (`/orders/new`, `/orders/:id/edit`): kartu produk dengan stok live untuk rentang sewa, klik = tambah qty, qty bisa +/− atau diketik (dibatasi stok), ringkasan + perkiraan total, pelanggan baru dari POS. Dapat dibuka dari halaman Pesanan maupun kalender.
- [x] API `GET /calendar/orders` (pesanan aktif selain REJECTED/CANCELLED/EXPIRED yang beririsan dengan rentang). Tanpa perubahan schema.
- [x] Alur disederhanakan (permintaan owner): hanya **Ajukan → Konfirmasi** (konfirmasi dari PENDING_REVIEW, stok tetap dialokasikan atomik); PIC penyewa tidak lagi wajib; hanya PIC gudang dan PIC lapangan (internal atau penyewa); gudang dapat checkout dari pesanan CONFIRMED tanpa Jadwalkan. Penawaran/hold/jadwal/tolak disembunyikan dari UI (endpoint tetap ada).
- [x] Halaman `/calendar` dan `OrderModal` dihapus (digantikan kalender depan dan POS).
- [x] Alamat lengkap + titik peta lokasi acara pada form pesanan (`orders.event_address/event_lat/event_lng`, migrasi aditif `20261113090000_order_event_address_geo`). Titik dipilih lewat klik/seret di peta (Leaflet/OpenStreetMap, tanpa API key), tempel koordinat/tautan Google Maps, atau lokasi perangkat; tampil + tautan "Buka di Google Maps" di detail pesanan. Klik peta membuka dialog besar dengan pencarian tempat/alamat (`GET /geocode/search`).
- [x] Aset ditampilkan per barang dengan qty dan rincian unit per tanggal perolehan (`GET /assets/groups[/:productId]`); form Aset baru memiliki Jumlah (membuat banyak unit sekaligus). SKU produk dan referensi penerimaan terisi otomatis (dapat diubah); form Aset baru kosong saat dibuka.

- [x] Foto aset opsional: foto contoh per kelompok pembelian dan foto kondisi awal per unit (maks. 5, append-only), ditambahkan setelah input pembelian lewat panel kelompok / detail aset. Keputusan owner: foto selalu **opsional** (tidak pernah diwajibkan, termasuk saat checkout gudang).

- [x] Merek, label batch, dan ukuran kabinet (permintaan owner, 14 Nov 2026; contoh lembar Excel LED P3.91 Dahua/Cailiang, Batch 1/3): satu jenis barang (produk) boleh dibeli berkali-kali dan berbeda merek. Migrasi aditif `20261114090000_brand_batch_dimensions`: `assets.brand`/`batch_label`, `stock_receipts.batch_label`, `stock_receipt_items.brand`, `products.width_cm/height_cm` (CHECK berpasangan). Merek + label batch diisi di penerimaan stok dan form Aset baru, diturunkan ke tiap unit. `GET /assets/breakdown` + modal **Rekap stok** di `/assets` (barang × batch × merek, jumlah unit, total luas m² = jumlah × ukuran; unit pensiun tidak dihitung); daftar kelompok menampilkan label batch dan sebaran merek. Keputusan: satu produk per ukuran/varian (bukan induk dengan varian); kabel tetap dilacak per unit (stok curah belum ada).

- [x] Barang stok tidak terbatas (permintaan owner, 14 Nov 2026; mis. kabel jumper 1 meter yang rawan hilang dan bisa dibuat kapan saja, ikut dalam paket seperti sewa videotron 5 meter). Migrasi aditif `20261114120000_unlimited_stock`: `products.stock_mode` (`TRACKED`/`UNLIMITED`), `pick_list_lines.unlimited/packed_qty/returned_qty`, `scan_events.product_id/quantity`, aksi scan `COUNT_OUT`/`COUNT_RETURN`. Produk unlimited tanpa aset/QR (pembuatan aset dan penerimaan ditolak `PRODUCT_UNLIMITED`; produk beraset tak bisa dijadikan unlimited), tidak pernah membatasi ketersediaan/alokasi, bisa jadi komponen paket (Komposisi) dan dipesan sendiri di POS ("Tak terbatas"). Keputusan owner: bukti keluar/kembali = **hitung jumlah** (`POST /pick-lists/:id/count`, event append-only) — pick list siap keluar hanya bila jumlah dikemas ≥ kebutuhan; saat kembali jumlah wajib diisi (0 boleh); **selisih hanya dicatat** (berita acara + catatan status pesanan), tidak memblokir dan tidak membuat status ISSUE. Surat jalan/berita acara PDF memuat tabel "Barang tanpa QR (dihitung)". Web: toggle di form Produk, panel hitung di detail pick list.

- [x] Harga sewa per m² (permintaan owner, 14 Nov 2026; videotron dihargai per meter persegi dan sudah include katrol, kabel, tiang sangga; kebutuhan aksesori ikut bertambah menurut ukuran dan kondisi lapangan). Migrasi aditif `20261114150000_pricing_area` (nilai enum `PricingUnit` = `AREA`). Dasar harga **Per m²**: kolom harga = tarif per m², harga satu unit = tarif × (lebar × tinggi) / 10.000 (`effectiveUnitPrice` di shared, dipakai API dan POS); wajib mengisi ukuran. Snapshot `unitPrice` pesanan memakai harga hasil hitung. Aksesori "include" = produk berharga Rp 0 (tampil "Termasuk paket" di POS) yang jumlahnya diatur per pesanan lewat baris POS biasa (tanpa rasio tetap); POS menampilkan total luas (m²).

- [x] Videotron "per meter" dengan ukuran kabinet bebas (permintaan owner, 14 Nov 2026): POS memesan dalam **m²**, gudang memilih kabinet 50×50 / 100×50 sesuai ketersediaan selama total luas **pas** dengan pesanan (mis. 2 m² = 8×50x50, atau 4×100x50, atau 2×100x50 + 4×50x50; tidak boleh lebih, dan checkout diblok bila kurang). Migrasi aditif `20261114180000_area_pool` + `20261114190000_pick_line_extra_quantity`: `StockMode.AREA_POOL`, `products.area_pool_id`, `pick_list_lines.area_pool/extra`, `pick_list_items.extra`. Keputusan owner: bilangan bulat m²; kabinet anggota **tidak** dipesan langsung (hanya lewat produk meter, ditolak `PRODUCT_POOLED`); aksesori (katrol, kabel, tiang sangga) **ditambah gudang di pick list** (di luar pesanan, berharga 0, scan/hitung, tercatat di surat jalan dan berita acara). Stok produk meter = total luas kabinet anggota yang boleh dialokasikan; alokasi dalam m² pada produk meter. Form Produk: jenis stok (Terlacak / Tak terbatas / Per meter) dan kelompok kabinet.

- [x] Kategori produk opsional (permintaan owner, 14 Nov 2026): produk boleh tanpa kategori. Migrasi aditif `20261114200000_product_category_optional` (`products.category_id` nullable); `ProductDto.category`/`categoryId` dan `AssetProductRef.category`/`AssetGroupDto.categoryName` kini dapat `null`. Form Produk: opsi "Tanpa kategori" (default kosong untuk produk baru), peringatan "buat kategori dulu" dihapus.

- [x] Harga negosiasi dan borongan (permintaan owner, 16 Nov 2026): harga produk hanya **harga default/pembanding**; admin menetapkan harga final per baris di POS (tanpa persetujuan pelanggan) atau memilih **harga borongan** satu total untuk seluruh pesanan (tidak dikali hari). Migrasi aditif `20261116090000_order_negotiated_lump_price`: `orders.pricing_mode`/`lump_total` (+CHECK), `order_items.list_price` (diisi dari harga lama untuk pesanan existing). `orderInputSchema` menerima `pricingMode`, `lumpTotal`, dan `items[].unitPrice`; invoice menyalin total borongan; penawaran ulang mempertahankan harga negosiasi. Capability baru `order.price.read` (Owner, Admin, Koordinator): Gudang menerima DTO `pricesHidden` tanpa nominal (detail, daftar, dan ringkasan pesanan di modul gudang). POS: input harga per baris (`CurrencyInput`) dengan selisih % terhadap default, toggle borongan, pembanding total default. Aturan batas gudang (luas m², jumlah scan ≤ pesanan) tidak berubah dan sudah ada sejak item videotron per meter. Test: `orderPricing.test.ts` (5), `pos.test.ts`.

- [x] Checklist pengembalian aset + tombol Scan (permintaan owner, 19 Nov 2026): panel pengembalian di detail pick list menampilkan checklist per aset (progres "x dari y kembali"). Owner/Admin (`scan.manual`) dapat mencentang satu/banyak/semua aset lalu **Tandai terpilih kembali** tanpa memindai (dicatat sebagai scan event MANUAL dengan kondisi/lokasi/catatan yang sama); peran lain checklist hanya-lihat dan wajib scan QR. Tombol **Scan dengan kamera** membuka `components/ui/Scanner` (BarcodeDetector, multi-scan, cadangan ketik kode). Tanpa perubahan API/schema (memakai `POST /pick-lists/:id/return/scan`). Test: `lib/qr.test.ts`. **Terverifikasi:** tsc, eslint, prettier, vitest web (36 lulus). **Belum:** `pnpm check` penuh (API `prisma generate` EPERM karena DLL terkunci), `vite build` (modul vite tidak ada di `apps/web/node_modules`), dan uji visual ponsel/desktop. **Update 21 Nov 2026:** lint, format:check, typecheck, `vite build` web, dan test (api 161, shared 39, web 44, api-client 8, field 7) hijau; dicentang. Uji visual ponsel/desktop dilakukan owner secara manual.

- [x] Tab daftar gudang (permintaan owner, 19 Nov 2026): `/warehouse` dibagi 4 tab dengan angka jumlah: **Perlu dikeluarkan** (OPEN/VERIFIED), **Di luar** (DISPATCHED, masa sewa belum lewat), **Konfirmasi kembali** (DISPATCHED dengan tanggal selesai lewat, atau RETURN_ISSUE), **Selesai** (RETURNED/CANCELLED). Pemisahan di server (`GET /pick-lists?tab=`, `GET /pick-lists/tab-counts`, tanggal acuan WIB), tanpa perubahan schema; tab Di luar/Konfirmasi kembali diurutkan tanggal selesai terdekat. Filter status lama diganti tab. Test API: `warehouse.test.ts` (tab). **Terverifikasi:** tsc (shared, api-client, web, api), eslint, vitest web, vitest `warehouse.test.ts` (11 lulus). **Belum:** `pnpm check` penuh, `vite build`, dan cek visual ponsel/desktop.

- [x] Invoice otomatis mengikuti pesanan (permintaan owner, 19 Nov 2026): konfirmasi pesanan (`/orders/:id/confirm`) menerbitkan invoice ISSUED otomatis dari snapshot subtotal+deposit (jatuh tempo = tanggal mulai; dilewati bila nilai 0 atau sudah ada invoice aktif). Pembatalan pesanan (`/orders/:id/cancel`) mem-void invoice aktif; bila sudah ada pembayaran aktif/pending, pembatalan ditolak `INVOICE_HAS_PAYMENTS` (void pembayaran dulu). No-show otomatis mem-void invoice yang belum dibayar; yang sudah ada pembayaran dibiarkan (deposit hangus). Helper `issueInvoiceForOrder`/`voidInvoicesForOrder` di `finance/service.ts`; test di `orderPricing.test.ts`.

- [x] Tanpa deposit, barang keluar wajib DP minimum (permintaan owner, 19 Nov 2026): `DEPOSIT_ENABLED = false` (shared) — pesanan baru selalu berdeposit 0 (`computeTotals`), field/kolom deposit di POS, produk, dan detail pesanan disembunyikan; data deposit lama tetap utuh (riwayat). Persen DP minimum (default 30%) disimpan di tabel baru `app_settings` dan hanya Owner yang mengubahnya (`PUT /settings/payment-policy`, capability baru `finance.policy`; Admin tidak memilikinya). Checkout gudang (`/pick-lists/:id/checkout`) menolak `DP_REQUIRED` bila pembayaran **sewa** SUCCEEDED pada invoice aktif < persen × sewa pesanan (pending/void/gagal tidak dihitung). Owner dapat mengizinkan tanpa DP lewat `POST /orders/:id/dp-waiver` (alasan wajib; kolom `orders.dp_waived_*` + audit). Web: `DpPanel` di detail pesanan (status, tombol Bayar DP, Izinkan tanpa DP), badge + pengaturan persen di halaman Invoice. Migrasi aditif `20261119100000_dp_policy`. Test: `dp.test.ts`; test lama disesuaikan (deposit 0; `resetDb` menyetel DP 0% sebagai default test).

- [x] Verifikasi akhir dua cara (permintaan owner, 19 Nov 2026): di mode **Verifikasi akhir** pick list ada checklist aset (progres "x dari y terverifikasi"). Cara 1 scan ulang (QR/kamera/ketik kode untuk Owner/Admin); cara 2 centang checklist lalu **Verifikasi terpilih** (khusus `scan.manual` = Owner/Admin, tercatat scan event MANUAL; peran lain checklist hanya-lihat dan wajib scan QR). Komponen `components/warehouse/VerifyPanel.tsx`; tanpa perubahan API/schema (memakai `POST /pick-lists/:id/scan` aksi VERIFY). **Terverifikasi:** tsc, eslint, prettier, vitest web (36 lulus). **Belum:** `vite build`, `pnpm check` penuh, test komponen, dan uji visual ponsel/desktop.

- [x] Stok POS mengikuti keranjang (permintaan owner, 19 Nov 2026): angka stok di kartu produk = sisa fisik (per komponen, dari `/availability/check` mode `independent`) dikurangi pemakaian keranjang; menambah jumlah mengurangi stok, menguranginya mengembalikan stok, termasuk stok yang dipakai bersama paket/kelompok per meter. `lib/stock.ts` + `stock.test.ts`; hanya web. Juga memperbaiki posisi blok kalender pesanan (urutan CSS `col-span` vs `col-start`, `styles/calendarCss.test.ts`). **Terverifikasi** di Chrome headless (90 → 80 → 84) dan vitest web (40 lulus).

- [x] Pilih aset yang masih dipakai menyebut pesanannya (permintaan owner, 19 Nov 2026): scan PICK pada aset yang belum AVAILABLE kini ditolak `SCAN_ASSET_IN_USE` (atau `SCAN_ASSET_MISSING` bila tercatat hilang) dengan pesan berisi nomor pesanan, pelanggan, dan pick list pemakainya (`fields` → parameter terjemahan via `lib/errors.ts`; toast global dan panel scan sama-sama memakainya). Penolakan tetap tercatat sebagai scan event REJECTED. Aset yang statusnya bukan karena pick list (servis/karantina) tetap `SCAN_ASSET_UNAVAILABLE`. Test: `warehouse.test.ts`. **Terverifikasi:** tsc, eslint, prettier, vitest API (`warehouse.test.ts` 12 lulus) dan web (40 lulus). **Belum:** cek visual di browser.

- [x] Pilih aset dan verifikasi akhir jadi dua tab (permintaan owner, 19 Nov 2026): di detail pick list tab **1. Pilih aset** dan **2. Verifikasi akhir** masing-masing menampilkan progres (x / kebutuhan) dan bilah progres; tab terbuka otomatis sesuai progres (semua sudah dipilih → langsung verifikasi). Memakai gaya `ev-tabs` yang sama dengan daftar gudang; tanpa perubahan API. **Terverifikasi** di Chrome headless (PKL-2026-000004: tab dan progres tampil) + tsc, eslint, vitest web (42). **Belum:** cek lebar ponsel.

- [x] Warna kalender per pelanggan (permintaan owner, 19 Nov 2026): tiap pelanggan pada bulan yang tampil punya hue sendiri (sudut emas, `customerTones` di `lib/calendar.ts`; `--ev-hue` dikirim komponen, warna/terang-gelap di `styles/pages.css`), disertai legenda pelanggan. Status tetap terbaca: belum dikonfirmasi = garis putus-putus, selesai = pudar, kendala = cincin merah. `GET /calendar/orders` kini membawa `customerId`. Test: `lib/calendar.test.ts`, `orders.test.ts`. **Terverifikasi** di Chrome headless (3 pelanggan, 3 hue; tema terang/gelap; tanpa scroll horizontal di 375 px).

- [x] Kalender depan: garis tidak terputus, tampilan modern, popover rincian (permintaan owner, 19 Nov 2026): garis pemisah kolom digambar di latar minggu sehingga menerus melewati blok pesanan; gaya baru (kartu membulat, header hari akhir pekan, penanda hari ini, tombol + muncul saat hover, tombol **Hari ini**, ringkasan "n pesanan · m pelanggan", blok bergaris aksen warna pelanggan + chip jumlah aset). Kursor/fokus di atas blok memunculkan `CalendarOrderPopover`: pelanggan, status, nomor pesanan, periode, lokasi, **jumlah aset** (paket diuraikan; stok tak terbatas dan m² dicantumkan terpisah) dan isinya. `GET /calendar/orders` kini membawa `eventLocation`, `assetCount`, `lines`. Test: `orders.test.ts`, `lib/calendar.test.ts`. **Terverifikasi** di Chrome headless (desktop gelap/terang, 390 px; popover Hartono = 8 aset) + tsc, eslint, prettier, vitest web (43) dan API.

- [x] Menu **Stok gudang** langsung (permintaan owner, 19 Nov 2026): `/stock` (menu "Stok langsung", capability `asset.read`) menampilkan total, **Ready** (AVAILABLE), **Dipersiapkan** (RESERVED/PREPARED), **Keluar** (CHECKED_OUT/IN_TRANSIT/ON_SITE/RETURN_PENDING/ISSUE_ON_SITE) dan **Tidak tersedia** (servis/karantina), per produk; tab **Sedang keluar** dan **Dipersiapkan** mendaftar aset beserta pesanan, pelanggan, pick list, dan batas kembali (badge Terlambat). Disegarkan otomatis tiap 10 detik (dijeda saat tab tak terlihat atau dengan tombol Jeda; ada Segarkan manual). API `GET /stock/live` (hanya baca; aset pensiun diabaikan); pengelompokan status `LIVE_STOCK_BUCKETS` di shared. Tanpa perubahan schema. Test: `warehouse.test.ts` (stok langsung). **Terverifikasi** di Chrome headless (desktop + 390 px; jam "diperbarui" maju 10 dtk) + tsc, eslint, prettier, vitest web (43) dan API (152).

- [x] Panel daftar aset di stok langsung (permintaan owner, 19 Nov 2026): di tab **Per produk**, angka Ready / Dipersiapkan / Keluar / Tidak tersedia dapat diklik dan membuka panel di sisi kanan (di bawah tabel pada layar sempit) berisi aset produk itu pada kelompok tersebut: kode (link ke aset), status, kondisi, lokasi, dan bila dipegang pesanan: nomor pesanan, pelanggan, batas kembali (badge Terlambat). Ada pencarian di panel; klik angka yang sama menutup; panel ikut disegarkan bersama data langsung. API `GET /stock/live/assets?productId=&bucket=`. Test: `warehouse.test.ts`. **Terverifikasi** di Chrome headless (Ready 72, Out 18 dengan pesanan; layout tabel kiri/panel kanan) + tsc, eslint, prettier, vitest web (43) dan API (`hardening` + `warehouse`).

- [x] Daftar aset stok langsung meniru halaman Aset (revisi permintaan owner, 19 Nov 2026): klik angka di tab Per produk kini membuka **drawer kanan** (`Modal side`) berisi tabel yang sama dengan drawer Aset: centang (Shift+klik rentang), cetak label QR, kode (+ ikon foto/perlu perhatian), serial, kondisi, status, lokasi; klik baris membuka **dialog detail aset** (tanpa pindah halaman). Untuk Dipersiapkan/Keluar ditambah kolom pesanan (link, pelanggan, batas kembali, badge Terlambat). Tabel diekstrak menjadi `components/assets/AssetUnitTable.tsx` dan dipakai bersama `AssetBatchDrawer` (halaman Aset) dan `StockAssetsPanel`. API `GET /stock/live/assets` kini juga membawa serial, jumlah foto, dan flag perlu perhatian. **Terverifikasi** di Chrome headless (drawer Ready 72, Out 18; detail aset; regresi drawer halaman Aset 90 unit) + tsc, eslint, prettier, vitest web (43) dan API (`warehouse` + `hardening`).

- [x] Revisi drawer stok langsung (permintaan owner, 19 Nov 2026): tanpa centang/cetak QR dan tanpa serial/status/lokasi. Kolom: **Kode aset**, **Pesanan** (link + pelanggan), **Tgl keluar**, **Tgl kembali** (badge Terlambat), **Kondisi**; untuk Ready/Tidak tersedia hanya kode dan kondisi. Tgl keluar = tanggal checkout nyata (WIB), atau tanggal mulai sewa berlabel "rencana" bila barang belum keluar; tgl kembali = akhir sewa pesanan. Klik baris tetap membuka detail aset. `LiveStockAssetDto` diperkecil (hapus serial/lokasi/foto/perlu-perhatian) dan ditambah `outDate`/`outPlanned`. Drawer halaman Aset tidak berubah. **Terverifikasi** di Chrome headless + tsc, eslint, prettier, vitest web (43) dan API (`warehouse`, `hardening`).

- [x] Proses penggantian dipecah per langkah (permintaan owner, 19 Nov 2026): halaman detail tugas penggantian kini memakai 4 tab langkah **1 Pilih aset → 2 Verifikasi → 3 Kirim → 4 Terima**, masing-masing dengan penanda selesai (centang) / langkah saat ini (jam) / belum sampai (gembok) dan teks "Langkah x dari 4". Tiap tab hanya memuat isi langkahnya (form scan, tombol Kirim, form Terima, atau ringkasan + waktu bila sudah selesai); tab otomatis pindah ke langkah berikutnya setelah status maju, langkah lain tetap bisa dibuka untuk dilihat (langkah yang belum sampai menampilkan pesan terkunci). Tombol Lepas aset pindah ke langkah 2/3. Komponen `components/incidents/ReplacementSteps.tsx`; tanpa perubahan API. Test: `ReplacementSteps.test.ts`. **Terverifikasi** di Chrome (RPL-2026-000001: langkah 4 aktif, tab 1–3 selesai) + tsc, eslint, prettier, vitest web (44). **Belum:** cek lebar ponsel dan alur lengkap dari langkah 1.
- [x] Penerimaan pengganti dan pengembalian aset rusak (permintaan owner, 20 Nov 2026): penerimaan pengganti hanya di aplikasi lapangan (form web dibuang); dilakukan dari halaman insiden saat status "dalam perjalanan" oleh staf (QR; Owner/Admin boleh ketik kode aset) atau pelanggan portal (QR atau kode aset pada stiker; peran CUSTOMER dapat `replacement.receive`, dibatasi ke pesanannya); aset harus sama dengan pengganti yang dikirim. **Aset rusak** setelah pengganti diterima: boleh dibawa kembali lebih awal (gudang scan lewat `/pick-lists/:id/return/scan`, tombol di web dan mobile) atau dibiarkan ikut pengembalian pesanan; `ReplacementTaskDto` kini memuat `pickListId` dan `oldAssetReturn`. Teruji: incidents.test (pengembalian awal + scan ganda ditolak). **Penyewa memulai, gudang menerima (21 Nov 2026):** penyewa/PIC menekan "Serahkan aset rusak" di halaman insiden (aplikasi lapangan) → `POST /replacement-tasks/:id/return-old` (kolom baru `old_return_requested_at/by`, `old_return_note`; migrasi `20261120100000_replacement_old_return_request`, sudah diterapkan ke DB dev) mencatat permintaan, memberi notifikasi `replacement.oldReturnRequested` ke gudang, lalu gudang menerima lewat scan pengembalian (web/mobile menampilkan "penyewa menyerahkan aset ini"). Menunggu = tidak perlu tindakan; tanpa serah-terima aset ikut pengembalian pesanan. Belum: tampilan belum dicek di browser/perangkat; `prisma generate` penuh tertunda karena dev API mengunci DLL engine (tipe sudah terbarui).

**Selesai bila:** pesanan dapat dibuat lewat halaman Pesanan maupun kalender; stok live tampil per produk; test API/web lulus.

## Backlog Setelah MVP

- [ ] GPS real-time kendaraan/aset.
- [ ] Multi-cabang dan transfer antar gudang.
- [ ] Penyusutan aset dan laporan laba per aset.
- [ ] Integrasi WhatsApp/push notification lengkap.
- [ ] Multi-vendor/marketplace.
