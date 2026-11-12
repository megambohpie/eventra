# Eventra — Handoff Proyek

Dokumen ini adalah sumber ringkas keadaan proyek untuk manusia, Codex, Claude Code, atau agen lain. Baca sebelum implementasi agar pekerjaan tidak diulang.

**Terakhir diperbarui:** 12 November 2026  
**Status:** Fase 00–06 (termasuk dashboard owner, invoice/pembayaran, dan laporan keuangan) selesai dan terverifikasi otomatis; Fase 07 belum dimulai dan menunggu persetujuan owner.

## Urutan baca

1. `AGENTS.md`
2. Dokumen ini
3. `WORK_QUEUE.md`
4. `PRD.md` dan `TECHNICAL_SPEC.md`

## Kondisi yang sudah ada

| Area | Status | Catatan |
| --- | --- | --- |
| Monorepo | Selesai | pnpm workspace: `apps/web`, `apps/api`, `apps/mobile`, `packages/shared`, `packages/api-client`. |
| Frontend web | Dasar selesai | React, Vite, TypeScript, Tailwind, DaisyUI, i18n, theme toggle, halaman health. |
| Backend API | Dasar selesai | Express, Prisma, PostgreSQL, `GET /api/v1/health`. |
| Database lokal | Siap | Docker PostgreSQL port `5433`; migrasi yang ada sudah diterapkan. |
| Brand | Selesai | Logo v5, icon, token light/dark di `BRAND_GUIDE.md`. |
| Favicon | Selesai | `apps/web/public/eventra-icon.svg` direferensikan dari `apps/web/index.html`. |
| Alias frontend | Selesai | `@/*` mengarah ke `apps/web/src/*`. |

## Fase 01 — yang ada sekarang

| Area | Fakta |
| --- | --- |
| Schema | Migrasi `20261111111805_identity_master_data` (aditif): `users`, `refresh_tokens`, `password_reset_tokens`, `customers`, `categories`, `locations`, `products`. Rollback = drop tabel tersebut (migrasi lanjutan `drop_customer_contacts` menghapus `customer_contacts`) + hapus enum `Role`, `CustomerType`, `PricingUnit`. |
| RBAC | Role = enum DB; capability dipetakan di `packages/shared/src/rbac.ts` (Owner baca-saja, Admin penuh, Koordinator/Gudang baca sebagian). API memakai `requireCapability`, web memakai `RequireCapability` + `useAuth().can`. |
| Auth | Login JWT akses 15 menit; refresh token acak (hash saja di DB, 7 hari) dirotasi, pemakaian ulang token lama mencabut semua sesi. Status/role user dibaca dari DB tiap request. Reset password: token sekali pakai 1 jam, mencabut semua sesi. |
| Reset password | Belum ada pengiriman email: antarmuka `Mailer` di `routes/auth.ts`; di dev token dicetak ke log API, di production tidak dicetak. Implementasi nyata ditunda ke Fase 08. |
| Pelanggan | Data pelanggan saja. Keputusan owner: PIC tidak disimpan di pelanggan, melainkan ditunjuk per pesanan (Fase 03, `order_pics`). Migrasi `drop_customer_contacts` menghapus tabel `customer_contacts`. |
| Produk | Harga/deposit integer rupiah (kolom `BigInt`, DTO `number`); satuan `PCS`/`PACKAGE` + label. Kategori dengan produk tidak bisa dihapus. |
| Audit | Semua operasi tulis dan login/reset menulis `audit_logs` (password/token disaring). |
| Styling | Dipisah dari logika: `apps/web/src/styles/*.css` (kelas `ev-*`, `@apply` di `@layer utilities`). JSX hanya memuat nama komponen DaisyUI + kelas `ev-*`. |
| Web | Rute `/login`, `/forgot-password`, `/reset-password`, `/customers`, `/products`, `/master`; Axios client memuat auth interceptor + refresh sekali-bersama. |
| Admin pertama | `pnpm db:seed` memakai `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` dari `.env` (lihat `.env.example`; `JWT_SECRET` ≥ 32 karakter wajib). |
| Test API | Memakai database terpisah `eventra_test` (dibuat otomatis oleh `test/globalSetup.ts`; override dengan `TEST_DATABASE_URL`). Butuh Postgres dev berjalan. |

## Fase 02 — yang ada sekarang

| Area | Fakta |
| --- | --- |
| Schema | Migrasi `..._assets_qr_receipts` (aditif: `assets`, `asset_status_events`, `stock_receipts`, `stock_receipt_items` + enum) dan `..._code_sequences` (sequence `asset_code_seq`, `stock_receipt_number_seq`). Rollback = drop tabel/sequence/enum tersebut. |
| Aset | Satu baris = satu unit fisik, kode `AST-######`, QR token acak 144 bit (`qrToken`, tidak pernah ada di DTO/audit/riwayat). Tidak ada hapus; pensiun (`RETIRED`) final. Serial unik per produk. |
| Riwayat | `asset_status_events` append-only (RECEIVED, CREATED, STATUS/CONDITION/LOCATION_CHANGED, QR_REGENERATED, UPDATED); UPDATED hanya mencatat nama kolom, bukan nilai (harga beli tidak bocor). |
| Status/kondisi | Transisi manual dibatasi `MANUAL_STATUS_TRANSITIONS` (shared); aset DAMAGED yang AVAILABLE otomatis QUARANTINED dan tidak bisa kembali AVAILABLE selagi DAMAGED. Transisi operasional menunggu Fase 03–04. |
| Penerimaan | `/stock-receipts`: draft → `receive` (atomik; klaim DRAFT→RECEIVED dengan updateMany sehingga dua request bersamaan tidak menggandakan aset) membuat aset + QR + event asal per unit. Draft dapat diubah/dibatalkan. Maks 500 unit/baris, 1000/penerimaan. |
| QR/label | PNG (`GET /assets/:id/qr.png`) dan PDF label A4 3×8 (`GET /assets/labels.pdf?ids=`, maks 100) dibuat backend (`qrcode`, `pdfkit`). Scan: `GET /assets/scan/:token` (tanpa harga/pemasok). |
| RBAC | Capability baru: `asset.read/write/cost.read/status`, `receipt.read/write`. Harga beli/biaya hanya `asset.cost.read` (Owner, Admin). Owner baca-saja; Gudang/Koordinator: baca + ubah kondisi/status; Gudang juga menerima stok. |
| Web | `/assets` (ringkasan, filter, pilih + cetak label, aset baru), `/assets/:id` (info, QR, riwayat, ubah kondisi/status, regenerate QR), `/receipts` (daftar, draft, receive, cetak label). |

## Fase 03 — yang ada sekarang

| Area | Fakta |
| --- | --- |
| Schema | Migrasi `20261112001654_orders_bundles` (aditif): `product_bundles`, `orders`, `order_items`, `order_quotes`, `stock_allocations`, `order_pics`, `order_status_events`, sequence `order_number_seq` (`ORD-YYYY-######`), indeks unik parsial alokasi aktif, CHECK. Rollback = drop tabel/sequence/enum tersebut. |
| Paket | `PUT /product-bundles/:productId` mengganti komponen (1 satuan sewa → N aset fisik). Satu tingkat: komponen tidak boleh berpaket, produk berpaket tidak boleh jadi komponen. Produk tanpa paket dipenuhi asetnya sendiri (1:1). |
| Ketersediaan | `POST /availability/check` (maks. per item, per komponen) dan `GET /availability/calendar`. Stok total = aset berstatus yang boleh dialokasikan saat ini (bukan servis/karantina/pensiun/masalah). Hold kadaluarsa otomatis diabaikan walau job belum jalan. |
| Alokasi | `stock_allocations` per produk fisik per tanggal, status HOLD/CONFIRMED/RELEASED (tidak dihapus). Konfirmasi atomik: klaim status → kunci baris produk `FOR UPDATE` (urut id) → hitung ulang → alokasi semua tanggal; kurang di satu tanggal = rollback total. Test konkurensi (6 konfirmasi serentak, stok 10, qty 4 → tepat 2 sukses) lulus. |
| Pesanan | DRAFT → PENDING_REVIEW (wajib PIC penyewa + stok tersedia) → QUOTED (versi penawaran append-only, harga diambil ulang) → AWAITING_PAYMENT (hold, default 60 mnt) / CONFIRMED → SCHEDULED (wajib PIC gudang keluar/kembali + lapangan). Reject, cancel (melepas stok; membatalkan pesanan yang menahan stok butuh `order.approve`). Draft saja yang dapat diubah. Setiap perubahan status tercatat di `order_status_events` + audit. |
| Hold expiry | `expireHolds()` dijalankan `setInterval` 60 dtk di `server.ts`; konfirmasi hold kadaluarsa → 409 `HOLD_EXPIRED` dan pesanan `EXPIRED`. Job terjadwal produksi/observability ditunda ke Fase 08. |
| PIC | `order_pics`: peran CUSTOMER_PIC/WAREHOUSE_OUT/WAREHOUSE_IN/FIELD; sumber OWNER (pengguna internal)/CUSTOMER/THIRD_PARTY. Gudang wajib internal; pihak ketiga wajib organisasi + bukti otorisasi dan mencatat penyetuju. Selain CUSTOMER_PIC hanya satu per peran. Telepon: angka saja (3–20 digit, boleh `+`). |
| Kalender | `GET /calendar` (keluar = tanggal mulai, kembali = tanggal selesai, pesanan CONFIRMED dst.) dan `GET /calendar/day` (rincian pesanan, item, aset fisik, lokasi, PIC). |
| RBAC | Owner baca saja; Admin penuh; Koordinator: order.read/write + availability (tanpa approve); Gudang: baca. |
| Web | `/orders`, `/orders/:id`, `/calendar`, modal Komposisi di `/products`. |

## Fase 04 — yang ada sekarang

| Area | Fakta |
| --- | --- |
| Schema | Migrasi `20261112010820_warehouse_scan_handover` (aditif): `pick_lists`, `pick_list_lines`, `pick_list_items`, `scan_events`, `scan_photos`, `handover_documents`, `document_signatures` + enum; sequence `pick_list_number_seq`, `handover_out_number_seq`, `handover_return_number_seq`. Indeks unik parsial: satu pick list non-batal per pesanan; satu aset hanya di satu item aktif (PICKED/VERIFIED/DISPATCHED/MISSING). Trigger `forbid_mutation` melarang UPDATE/DELETE pada `scan_events`, `handover_documents`, `document_signatures`. Rollback = drop tabel/sequence/enum/fungsi tersebut. |
| Alur keluar | Pick list (`PKL-YYYY-######`) dibuat dari pesanan CONFIRMED/SCHEDULED; kebutuhan = konversi paket. `POST /pick-lists/:id/scan`: `PICK` (QR atau kode aset manual; aset AVAILABLE→RESERVED) lalu `VERIFY` (wajib QR; RESERVED→PREPARED). Semua terverifikasi → pick list VERIFIED. `POST /pick-lists/:id/checkout` hanya bila VERIFIED, pesanan SCHEDULED, dan aset masih PREPARED/tidak rusak: aset→CHECKED_OUT, pesanan→IN_PROGRESS, dokumen `SJ-YYYY-######` v1 dibuat. |
| Penolakan scan | Scan salah (QR tak dikenal, bukan produk dibutuhkan, kuantitas penuh, aset rusak/tidak tersedia, di luar pick list, sudah diverifikasi/dikembalikan) → 409/404 `SCAN_*`, dicatat sebagai `scan_events` REJECTED + audit `scan.rejected` di luar transaksi yang dibatalkan. |
| Alur kembali | `POST /pick-lists/:id/return/scan` (QR, kondisi, catatan, lokasi opsional): aset→AVAILABLE, atau QUARANTINED bila DAMAGED. Foto kondisi: `POST /pick-lists/:id/items/:itemId/photos` (body mentah JPEG/PNG, maks 3 MB, maks 5 per aset, magic bytes divalidasi, disimpan sebagai bytea). `POST /pick-lists/:id/return/complete`: item belum discan wajib dikonfirmasi (`acceptMissing`) → MISSING dan aset ISSUE_ON_SITE (tidak bisa dialokasikan); pesanan COMPLETED, atau ISSUE bila ada selisih; dokumen `BAR-YYYY-######`. Scan terlambat untuk item MISSING diterima; panggil `complete` lagi → berita acara versi baru dan ISSUE→COMPLETED. |
| Dokumen | `payload` JSON snapshot dibekukan saat dibuat; PDF (pdfkit) dirender dari snapshot + tanda tangan tersimpan (`GET /handover-documents/:id/pdf`). Tanda tangan = baris append-only (`POST .../sign`, PNG ≤200 KB, peran WAREHOUSE/COUNTERPART, PIC harus PIC pesanan dengan peran yang sesuai). Revisi (`POST .../revise` dengan alasan) = baris baru nomor sama versi+1; hanya versi terbaru yang bisa ditandatangani/direvisi. |
| Pembatalan | Membatalkan pesanan melepas aset di pick list OPEN/VERIFIED (aset→AVAILABLE) dan membatalkan pick list; kunci urutan pick list→pesanan sama dengan scan (bebas deadlock). |
| RBAC | Capability baru `warehouse.read` (Owner, Admin, Koordinator, Gudang), `warehouse.write` dan `handover.sign` (Admin, Gudang). FIELD_PIC belum punya akses (Fase 05/07). |
| Web | `/warehouse` (daftar + buat pick list), `/warehouse/pick-lists/:id` (scan pilih/verifikasi, checkout, scan kembali + foto, dokumen: unduh/cetak/tanda tangan canvas/revisi, log scan), tombol Gudang di detail pesanan, `SignaturePad` di `components/ui`. |

## Fase 05 — yang ada sekarang

| Area | Fakta |
| --- | --- |
| Schema | Migrasi `20261112032025_incidents_service_replacement` (aditif): `incidents`, `incident_photos`, `incident_events`, `service_tickets`, `replacement_tasks`, `notifications`, enum baru, nilai baru `ScanAction` (INCIDENT_SCAN, REPLACEMENT_*), kolom `incident_id`/`replacement_task_id` di `scan_events`; sequence `incident_number_seq`, `service_ticket_number_seq`, `replacement_number_seq` (INC-/SVC-/RPL-YYYY-######). Indeks unik parsial: satu tiket servis terbuka per aset, satu tugas penggantian aktif per insiden dan per aset pengganti. Trigger: foto/riwayat insiden append-only dan foto maks. 5. Rollback = drop tabel/sequence/enum/fungsi tersebut. |
| Insiden | `POST /incidents` (scan QR/kode aset → DRAFT; hanya aset DISPATCHED pada pesanan berjalan; PIC lapangan wajib ditugaskan sebagai PIC FIELD pesanan itu) → `POST /incidents/:id/photos` (body mentah JPEG/PNG, maks. 5) → `POST /incidents/:id/submit` (wajib 1–5 foto; aset → ISSUE_ON_SITE + kondisi DAMAGED; notifikasi ke pemegang `incident.review`). Review: `POST /incidents/:id/review` (GUIDANCE, TECHNICIAN + tiket servis otomatis, REJECT dengan alasan = aset dipulihkan, REPLACE = tugas penggantian). `POST /incidents/:id/close` untuk yang tuntas di lokasi; insiden REPLACED ditutup otomatis saat servis aset lama lolos pemeriksaan. PIC lapangan hanya melihat insiden miliknya/pesanannya. |
| Penggantian | `/replacement-tasks`: `scan` PICK/VERIFY (produk sama, bukan aset rusak, AVAILABLE, bukan DAMAGED; scan salah dicatat REJECTED), `DELETE /:id/asset`, `dispatch` (aset → IN_TRANSIT), `receive` oleh PIC lapangan (QR harus aset yang dikirim; aset → ON_SITE dan ditambahkan sebagai item DISPATCHED di pick list pesanan sehingga ikut dicocokkan saat kembali; insiden → REPLACED), `cancel` (sebelum dikirim; insiden kembali REPORTED). Semua operasi mengunci pick list pesanan lebih dulu (urutan kunci sama dengan scan gudang). |
| Pemeriksaan | Aset dengan insiden belum tuntas (REPORTED…REPLACED) atau tiket servis terbuka: saat kembali ke gudang selalu QUARANTINED walau dilaporkan baik, dan `POST /assets/:id/status` ke AVAILABLE ditolak (`ASSET_NOT_CLEARED`). Servis `complete` dengan hasil PASSED (kondisi tidak rusak) → AVAILABLE dan menutup insiden REPLACED; FAILED → QUARANTINED. |
| Servis | `/service-tickets` (buat/mulai/selesai/batal). Aset AVAILABLE/QUARANTINED → IN_SERVICE; aset ISSUE_ON_SITE tetap (kunjungan teknisi di lokasi). Biaya hanya terlihat dan terisi oleh `asset.cost.read`/dikirim pemegang `service.write`; DTO tanpa biaya untuk selain Owner/Admin. |
| Notifikasi | `GET /notifications`, `POST /notifications/:id/read`, `/read-all` (milik pengguna login). Teks diterjemahkan di klien dari `type` + `params`. Pengiriman WhatsApp/push tetap backlog. |
| RBAC | Capability baru: `incident.read` (Owner, Admin, Koordinator, FIELD_PIC terbatas pada miliknya), `incident.report` (Admin, Koordinator, FIELD_PIC), `incident.review` (Admin, Koordinator), `service.read` (Owner, Admin, Koordinator, Gudang), `service.write` (Admin, Koordinator, Gudang), `replacement.receive` (Admin, FIELD_PIC). Pemindaian aset pengganti di gudang memakai `warehouse.write`. |
| Web | `/incidents` (lapor, daftar), `/incidents/:id` (foto, kirim, keputusan, tutup, penggantian + terima, tiket, riwayat), `/replacements` + `/replacements/:id` (scan pilih/verifikasi, kirim), `/service-tickets`, lonceng notifikasi di navbar. Menu mengikuti capability. |

## Fase 06 — yang ada sekarang

| Area | Fakta |
| --- | --- |
| Schema | Migrasi `20261112052331_finance_invoices_payments` (aditif): `invoices`, `payments`, `invoice_reminders` + enum, sequence `invoice_number_seq` (INV-YYYY-######). Indeks unik parsial: satu invoice ISSUED per pesanan. CHECK nominal; trigger `guard_payment_change` (tanpa DELETE, nominal/tujuan/metode/tanggal tidak berubah, status searah PENDING→SUCCEEDED/FAILED/VOIDED, SUCCEEDED→VOIDED), `guard_invoice_change` (tanpa DELETE, nominal tetap, VOID final), pengingat append-only. Rollback = drop tabel/sequence/enum/fungsi tersebut. |
| Invoice | `POST /invoices` menyalin `subtotal` (sewa) dan `depositTotal` pesanan; hanya pesanan AWAITING_PAYMENT…COMPLETED/ISSUE; jatuh tempo default = tanggal mulai sewa. Salah nominal = void (ditolak bila ada pembayaran aktif) lalu terbit ulang. Status pembayaran diturunkan (`computeInvoiceBalance` di shared): UNPAID/PARTIAL/PAID/OVERDUE/VOID. |
| Pembayaran | `POST /invoices/:id/payments` (tujuan RENT/DEPOSIT; tunai/transfer/lainnya langsung SUCCEEDED oleh admin, GATEWAY = PENDING; transfer & gateway wajib referensi; nominal ≤ sisa per tujuan termasuk PENDING; invoice dikunci FOR UPDATE sehingga serentak tidak melebihi tagihan). `/payments/:id/confirm|reject|void`. **Adapter gateway:** `settlePayment` di `finance/service.ts` adalah titik masuk tunggal; belum ada gateway/webhook nyata (butuh keputusan penyedia, Fase 08). Bukti = nomor referensi (unggah berkas belum ada). |
| Pendapatan vs piutang | `GET /reports/revenue?from&to&groupBy` = pembayaran RENT berstatus SUCCEEDED menurut tanggal diterima (UTC), deposit terpisah, pembayaran terlambat (diterima setelah jatuh tempo). `GET /reports/receivables` = sisa tagihan aktual per invoice (sewa + deposit) beserta PIC penyewa, ringkasan terlambat, dan nilai sewa pesanan berjalan (CONFIRMED/SCHEDULED/IN_PROGRESS/ISSUE) yang bukan pendapatan. |
| Pengingat | `POST /invoices/:id/remind` (manual) dan `sendDueReminders` (`setInterval` 15 mnt di `server.ts`): invoice belum lunas dengan jatuh tempo ≤ 3 hari/terlambat, maks. satu per 24 jam; dicatat di `invoice_reminders` dan memberi notifikasi dalam aplikasi ke pemegang `finance.read` (tipe `invoice.reminder`). WhatsApp/email ke pelanggan tetap backlog. |
| Dashboard | `GET /dashboards/owner?staleDays`: sebaran status aset, aset rusak, aset tanpa pembaruan (tanpa perubahan status/kondisi/lokasi N hari, tidak termasuk pensiun), insiden/tiket servis terbuka, aset paling sering disewa dan paling sering rusak. Pergerakan per tanggal memakai `/calendar` + `/calendar/day` yang sudah ada (drill-down pesanan, jumlah, lokasi, PIC), ditampilkan lewat komponen bersama `MovementList` (endpoint `/dashboards/asset-movements` pada spec tidak dibuat karena duplikat). `GET /assets/:id/metrics`: umur, harga beli, jumlah sewa, hari sewa, servis, biaya servis, insiden (harga/biaya hanya `asset.cost.read`). |
| RBAC | `finance.read` (Owner, Admin), `finance.write` (Admin), `dashboard.read` (Owner, Admin, Koordinator). Owner tetap baca saja. |
| Web | `/dashboard`, `/invoices`, `/invoices/:id`, `/finance`; kartu metrik di detail aset; komponen baru `ui/StatTile`, `components/finance/*`, `orders/MovementList` (diekstrak dari Kalender). |

## Asumsi Fase 06

- Invoice satu per pesanan (bukan per termin); deposit ditagih di invoice yang sama dan dilacak terpisah (bukan pendapatan). Pengembalian deposit belum dimodelkan.
- Pesanan `confirm` tidak mensyaratkan pembayaran (tetap manual oleh admin seperti Fase 03).
- Tanggal laporan memakai UTC (konsisten dengan tanggal lain); pergeseran zona WIB pada pembayaran dini hari belum ditangani.
- Daftar invoice menyaring status turunan di memori (cukup untuk skala MVP); pindah ke SQL bila volume besar.
- PDF invoice/penawaran (FR-05, Should) dan unggah bukti pembayaran belum dikerjakan.

## Asumsi Fase 05

- Rute `/incidents/:id/replacement` pada spec digantikan `/replacement-tasks/*`; tugas penggantian dibuat otomatis oleh keputusan REPLACE.
- Aset pengganti harus produk yang sama dengan aset rusak (menjaga kebutuhan per produk di pick list).
- Laporan hanya untuk aset yang sedang keluar pada pesanan berjalan; kerusakan aset di gudang ditangani lewat kondisi aset/tiket servis.
- Tiket servis belum memiliki foto sebelum/sesudah (PRD menyebutnya); notifikasi hanya di dalam aplikasi (polling 60 dtk).
- Scan web memakai input teks (pemindai hardware); kamera web/mobile menunggu Fase 07.
- Pengguna FIELD_PIC harus ditunjuk sebagai PIC "Lapangan" (sumber Pemilik) pada pesanan agar dapat melapor dan menerima pengganti.

## Asumsi Fase 04

- Rute `/warehouse/check-out` dan `/warehouse/returns` pada spec digabung ke `/warehouse/pick-lists/:id`; endpoint `/handover/checkout|return` menjadi `/pick-lists/:id/checkout` dan `/return/*`.
- Tidak ada object storage: foto kondisi dan tanda tangan disimpan sebagai bytea di PostgreSQL; PDF dirender on-demand dari snapshot immutable (bukan berkas tersimpan). Pindah ke S3 bisa dilakukan di Fase 08.
- Scan pra-pengembalian oleh PIC lapangan dan status IN_TRANSIT/ON_SITE/RETURN_PENDING belum dipakai (menunggu akses PIC lapangan Fase 05/07); scan kembali menerima aset CHECKED_OUT/IN_TRANSIT/ON_SITE/RETURN_PENDING/ISSUE_ON_SITE.
- Alokasi stok per tanggal tidak dilepas lebih awal saat pengembalian lebih cepat dari tanggal selesai.
- Scan lewat kamera web belum ada; web memakai input teks (pemindai hardware/keyboard-wedge). Kamera masuk Fase 07 (mobile).

## Asumsi bisnis Fase 03 (konfirmasi owner)

- Harga sewa = harga × jumlah × hari (hari mulai dan selesai dihitung); deposit tidak dikali hari.
- Hari pasang/bongkar tidak mengurangi kuota; hold default 60 menit (5–1440 per permintaan).
- Pembayaran/deposit belum ada (Fase 06): `confirm` dilakukan admin secara manual.

## Keputusan yang wajib dijaga

- Fokus utama: kontrol aset rental event untuk owner.
- Stack: React web, React Native mobile, Node.js/TypeScript API, PostgreSQL, Axios, DaisyUI/Tailwind di web.
- Gunakan Axios dan alias `@/` pada frontend; jangan memakai `fetch` atau import relative panjang.
- UI web wajib menggunakan DaisyUI.
- Logo yang sah untuk light maupun dark mode: `eventra-logo-v5.svg`. Di dark mode logo tanpa kotak putih, memakai inversi terang di komponen `Logo` (keputusan owner); selain itu yang berubah hanya token UI.
- QR, scan event, audit log, dokumen bertanda tangan, allocation, dan pembayaran adalah historis append-only.
- Alokasi stok harus atomik per tanggal agar tidak terjadi overbooking.

## Menjalankan lokal

```powershell
docker compose up -d db
$env:DATABASE_URL = 'postgresql://eventra:eventra@localhost:5433/eventra?schema=public'
pnpm.cmd db:migrate
pnpm.cmd dev:api
pnpm.cmd dev:web -- --host 127.0.0.1 --port 5173 --strictPort
```

- Web: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:3000/api/v1/health`
- Jika PowerShell menolak `pnpm.ps1`, gunakan `pnpm.cmd`.
- Backend TSX pernah gagal dalam sandbox karena akses profil OS; menjalankan development server di luar sandbox berhasil.

## Verifikasi terakhir (Fase 06, 12 November 2026)

| Perintah | Hasil |
| --- | --- |
| `eslint .` / `prettier --check .` | Lulus |
| `tsc` di api, web, shared, api-client | Lulus |
| Test shared / api / api-client / web | Lulus: 22 / 74 / 6 / 13 (api termasuk 9 test Fase 06: RBAC, siklus invoice-pembayaran-void, batas bayar + konkurensi, trigger DB, pendapatan vs piutang vs terlambat, pengingat, dashboard + metrik aset) |
| `vite build` web dan `tsup` api | Lulus; peringatan bundle >500 kB belum blocker |

**Belum terverifikasi penuh:** (1) `pnpm check` utuh belum dijalankan; tiap tahap dijalankan terpisah dan hijau. `prisma generate` gagal EPERM selama dev API berjalan (DLL engine terkunci) — client Prisma sudah ter-generate untuk tipe; hentikan dev API lalu `pnpm db:generate` bila engine perlu disegarkan. (2) Tampilan halaman Fase 02–06 dan PDF belum diperiksa visual di browser pada lebar ponsel ≈360 px dan desktop. (3) Jalankan `pnpm db:migrate` pada database dev bila belum (migrasi Fase 06 sudah diterapkan ke `eventra` dev).

## Pekerjaan berikutnya

Ikuti `WORK_QUEUE.md`. Fase 07 (mobile operasional) dimulai hanya setelah owner menyetujui Fase 06; memakai API yang sama untuk scan, lapor insiden, dan terima pengganti. Fase 08 perlu memutuskan gateway pembayaran nyata (panggil `settlePayment`), pengiriman pengingat ke pelanggan, dan zona waktu laporan.

## Catatan terbuka

- Refresh token web disimpan di `localStorage` (access token hanya di memori). Pertimbangkan cookie httpOnly saat hardening (Fase 08), bersama rate limit login yang belum ada.
- UI belum memiliki halaman manajemen user; pembuatan user lewat `POST /users` atau seed.

- Hard refresh (`Ctrl + F5`) bila favicon browser masih cached.
- `eventra-logo-dark.svg` adalah eksplorasi lama; jangan gunakan.
- Aset brand source frontend ada di `apps/web/src/assets/brand/`; root `assets/brand/` adalah referensi brand/dokumen.
- Harga perolehan aset hanya untuk owner/admin berwenang.

## Aturan pembaruan

Setelah pekerjaan material selesai atau terblokir, update dokumen ini dengan fakta terverifikasi: status, file/komponen, test yang dijalankan, keputusan, blocker, dan next step. Jangan menulis secret atau log mentah. Perbarui `WORK_QUEUE.md` bila status fase berubah.
