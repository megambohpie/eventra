# Eventra — Handoff Proyek

Dokumen ini adalah sumber ringkas keadaan proyek untuk manusia, Codex, Claude Code, atau agen lain. Baca sebelum implementasi agar pekerjaan tidak diulang.

**Terakhir diperbarui:** 13 November 2026 
**Status:** Fase 00–08 selesai dan terverifikasi otomatis (Fase 08 = hardening dan rilis). Yang tersisa adalah langkah manusia: UAT owner (`RELEASE_PLAN.md` §3), uji mobile di perangkat nyata, pemeriksaan visual web 360 px/desktop, dan uji restore di server target. Keputusan terbuka (penyedia email, gateway pembayaran, cookie httpOnly) ada di `RUNBOOK.md` §8.

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
| RBAC | Role = enum DB; capability dipetakan di `packages/shared/src/rbac.ts` (Owner dan Admin penuh, Koordinator/Gudang baca sebagian). API memakai `requireCapability`, web memakai `RequireCapability` + `useAuth().can`. |
| Auth | Login JWT akses 15 menit; refresh token acak (hash saja di DB, 7 hari) dirotasi, pemakaian ulang token lama mencabut semua sesi. Status/role user dibaca dari DB tiap request. Reset password: token sekali pakai 1 jam, mencabut semua sesi. |
| Reset password | Belum ada pengiriman email: antarmuka `Mailer` di `routes/auth.ts`; di dev token dicetak ke log API, di production tidak dicetak. Implementasi nyata menunggu keputusan penyedia (lihat Fase 08 / RUNBOOK §8). |
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
| RBAC | Capability baru: `asset.read/write/cost.read/status`, `receipt.read/write`. Harga beli/biaya hanya `asset.cost.read` (Owner, Admin). Owner penuh (keputusan owner, 2026-11-12); Gudang/Koordinator: baca + ubah kondisi/status; Gudang juga menerima stok. |
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
| RBAC | Owner dan Admin penuh; Koordinator: order.read/write + availability (tanpa approve); Gudang: baca. |
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
| RBAC | `finance.read` (Owner, Admin), `finance.write` (Admin), `dashboard.read` (Owner, Admin, Koordinator). Owner kini punya semua capability. |
| Web | `/dashboard`, `/invoices`, `/invoices/:id`, `/finance`; kartu metrik di detail aset; komponen baru `ui/StatTile`, `components/finance/*`, `orders/MovementList` (diekstrak dari Kalender). |

## Fase 07 — yang ada sekarang

| Area       | Fakta                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stack      | Expo SDK 58 / React Native; tambahan `expo-camera`, `expo-image-picker`, `expo-secure-store`, `@react-native-community/netinfo`, `react-native-safe-area-context`. Tanpa react-navigation: navigasi tumpukan sederhana (`lib/navigation.ts`) + tombol Back Android. Semua HTTP lewat `@eventra/api-client` (Axios). Tidak ada perubahan backend/schema; `api-client` kini menerima `UploadFile` (Blob web atau byte RN). |
| Struktur   | `apps/mobile/App.tsx` (root: restore sesi, tab Tugas/Insiden/Akun, tumpukan detail), `src/screens/*`, `src/ui.tsx` (komponen bersama bertoken tema), `Scanner.tsx`, `PhotoPicker.tsx`, `src/lib/*` (logika murni yang diuji: sesi, tugas, navigasi, QR, foto, label).                                                                                                                                  |
| Sesi       | Login `/auth/login`; refresh token + profil di SecureStore, access token hanya di memori; 401 → refresh sekali-bersama → ulang; gagal → kembali ke login. Saat start profil/peran disegarkan lewat `/me` (offline: data tersimpan).                                                                                                                                                                     |
| Tugas saya | Diturunkan di klien (`lib/tasks.ts`): pick list OPEN/VERIFIED/DISPATCHED/RETURN_ISSUE (`warehouse.read`), tugas penggantian (siapkan: `warehouse.read`; terima: `replacement.receive`), insiden DRAFT/terbuka (`incident.read`; API sudah membatasi PIC lapangan ke miliknya). Urut menurut urgensi.                                                                                                   |
| Scan       | `Scanner` (kamera QR + cooldown 2 dtk per kode). Kode aset manual hanya untuk memilih aset/penggantian dan lapor insiden; verifikasi, pengembalian, dan terima pengganti wajib QR (sesuai API). Scan ditolak server tampil di pemindai dan tercatat `scan_events` seperti di web.                                                                                                                        |
| Foto       | Kamera/galeri → base64 → byte (`lib/photos.ts`), divalidasi JPEG/PNG ≤ 3 MB sebelum unggah, kualitas 0.6; diunggah sebagai body mentah. Insiden 1–5 foto (draft → unggah → submit; gagal di tengah → draft dilanjutkan dari detail). Foto kondisi pengembalian per aset (maks. 5).                                                                                                                     |
| Offline    | `OfflineBanner` (NetInfo); tombol aksi dinonaktifkan saat offline kecuali coba-lagi/keluar; tidak ada antrean offline karena scan harus divalidasi server (invarian stok/aset). Galat jaringan tampil sebagai ErrorState + coba lagi atau toast.                                                                                                                                                         |
| RBAC       | Tombol mengikuti capability (`mobileAccess`): Gudang = scan/checkout/kembali/dokumen; PIC lapangan = lapor insiden + terima pengganti; Owner = lihat saja. API tetap sumber kebenaran.                                                                                                                                                                                                                 |
| Dokumen    | Layar baca-saja snapshot (`/handover-documents/:id`) bagi pemegang `warehouse.read`. PDF, tanda tangan, dan revisi tetap di web.                                                                                                                                                                                                                                                                       |

## Fase 08 — yang ada sekarang

| Area | Fakta |
| --- | --- |
| Schema | Migrasi `20261112080000_hardening_append_only` (aditif): trigger `forbid_mutation` pada `audit_logs`, `asset_status_events`, `order_status_events`. Rollback = 3 `DROP TRIGGER` (tercatat di akhir file migrasi). Sudah diterapkan ke DB dev. |
| Batas laju | `apps/api/src/ops/rateLimit.ts` (memori, tanpa dependensi): login 10/15 mnt per IP+email dan 50 per IP, refresh 100/15 mnt, reset password 10/jam, global 600/mnt; 429 `RATE_LIMITED` + `Retry-After`. Nilai di `DEFAULT_RATE_LIMITS`. Test helper mematikannya (`rateLimits: false`). Hanya cocok untuk satu instance. |
| Env/CORS | `apiEnvSchema` menambah `CORS_ORIGINS` (wajib di production, tanpa `*`), `TRUST_PROXY`, `LOG_LEVEL`; production menolak `JWT_SECRET` contoh. `Cache-Control: no-store` di semua respons API. |
| Observability | `ops/logger.ts` (JSON per baris; access log memakai template rute sehingga token QR/reset tidak masuk log; `x-request-id`), `ops/errorReporter.ts` (satu titik: 500, job gagal, unhandledRejection/uncaughtException), `ops/jobs.ts` (`JobMonitor`: anti-tumpang-tindih, status per job). `/health/live`, `/health/ready` (503 bila DB mati atau job basi). `server.ts`: job `hold-expiry` dan `invoice-reminders` lewat `JobMonitor`, shutdown rapi. `console.*` tidak lagi dipakai di API. |
| Backup | `ops/backup.sh` (pg_dump format custom + sha256 + rotasi) dan `ops/restore-verify.sh` (restore ke DB sementara, bandingkan baris 36 tabel, trigger, migrasi); `pnpm ops:backup`, `pnpm ops:restore-verify`. Diuji nyata terhadap DB dev (Docker): "RESTORE OK". Folder `backups/` di-gitignore. |
| Test baru | `hardening.test.ts` (25: 401 pada SEMUA rute non-publik dibaca dari sumber rute, OWNER 403 pada semua rute tulis, JWT palsu/kadaluarsa/alg none, peran dari DB, rate limit, unggah: tipe/magic bytes/ukuran, token QR tidak bocor di DTO/audit/log, audit & append-only, header/CORS/health/error reporter, hold expiry + JobMonitor), `load.test.ts` (30 konfirmasi serentak stok 20 → tepat 10 menang; 108 request campuran; multi-produk urutan berlawanan tanpa deadlock; `LOAD_FACTOR=n` menaikkan skala; p95 ≈ 1 dtk lokal), `e2e.test.ts` (terima stok → pesan → bayar → scan keluar → tanda tangan → insiden → scan kembali → pendapatan/piutang). |
| Dokumen | `RUNBOOK.md` (komponen, checklist env, deploy, observability, backup/restore, rollback migrasi, prosedur insiden, batasan), `RELEASE_PLAN.md` (gerbang rilis, urutan peluncuran, lembar UAT owner). |

## Fase 09 — UX pesanan (13 November 2026)

| Area | Fakta |
| --- | --- |
| API | `GET /calendar/orders?from&to` (`order.read`): pesanan selain REJECTED/CANCELLED/EXPIRED yang beririsan dengan rentang; DTO `CalendarOrderDto`. Tanpa migrasi. |
| Web | Beranda = `OrderCalendar` (blok per pesanan, logika minggu di `lib/calendar.ts`), lalu shortcut/status. POS di `pages/OrderPosPage.tsx` (rute `/orders/new?start=`, `/orders/:id/edit`, butuh `order.write`; hanya draft yang dapat diubah); logika keranjang di `lib/pos.ts`. Stok live = `/availability/check` semua produk aktif (potongan 50) dengan `excludeOrderId` saat ubah. `CalendarPage` dan `OrderModal` dihapus; menu Kalender dihapus. |
| Alur ringkas | `submit` tidak lagi mensyaratkan PIC; `confirm` menerima PENDING_REVIEW (selain QUOTED/AWAITING_PAYMENT); checkout gudang menerima CONFIRMED atau SCHEDULED (`ORDER_NOT_SCHEDULED` kini berarti belum terkonfirmasi); penandatangan WAREHOUSE boleh PIC berperan WAREHOUSE_OUT atau WAREHOUSE_IN. UI detail pesanan hanya: Ubah, Ajukan, Konfirmasi, Gudang, Batalkan. PicModal hanya menawarkan PIC gudang (internal) dan PIC lapangan (internal/penyewa); peran lama tetap tampil. Endpoint quote/hold/schedule/reject dipertahankan. |
| Alamat & titik peta | Migrasi aditif `20261113090000_order_event_address_geo` (kolom `event_address`, `event_lat`, `event_lng` + CHECK; rollback ada di akhir berkas). `eventLocation` tetap nama lokasi (wajib); `eventAddress` opsional; lat/lng harus berpasangan (`orderInputSchema`). Web: `ui/LocationPicker` (+ `MapCanvas` Leaflet dimuat malas, tile OpenStreetMap, tanpa API key) dan `MapLink`; helper `parseCoordinates` di `shared/geo.ts` membaca "lat, lng" atau URL Google Maps (tautan pendek goo.gl tidak bisa). Bukan Google Maps JS API karena butuh API key/billing; ganti bila owner menyediakan key. Klik pratinjau peta membuka dialog besar (`ui/LocationSearchModal`): cari tempat/alamat (debounce 500 ms) atau klik/seret, lalu "Gunakan titik ini". Pencarian lewat proxy API `GET /geocode/search?q=&lang=` (`order.write`, Nominatim/OSM via Axios, 502 `GEOCODE_UNAVAILABLE` bila layanan mati) agar token login tidak dikirim ke pihak ketiga; Nominatim publik dibatasi ±1 req/dtk dan perlu diganti/di-cache bila volume naik. Teruji: shared 31, web 21, api (geocode/orders/hardening) 42; UI dialog belum dilihat di browser. |
| Aset per barang | Halaman `/assets` kini satu baris per barang (produk) dengan jumlah unit + sebaran status; klik baris barang → daftar kelompok pembelian di bawahnya (`AssetBatchList`, accordion; dikelompokkan per tanggal perolehan, `acquiredDate` = tanggal beli, atau tanggal terima stok, atau tanggal dibuat), klik kelompok → panel kanan `AssetBatchDrawer` (`Modal side`, geser dari kanan) berisi unit + pilih/cetak label QR. Klik baris unit → detail aset sebagai dialog (`AssetDetailDialog` memakai `AssetDetailView`, juga dipakai halaman `/assets/:id`), tanpa pindah halaman. API baru `GET /assets/groups` (per barang, paginasi per produk) dan `GET /assets/groups/:productId` (batch per tanggal, maks. 2000 unit); filter sama dengan daftar unit. Model data tidak berubah: tetap satu baris = satu unit dengan QR sendiri (invarian scan/alokasi). Form Aset baru punya **Jumlah** (`quantity` 1–500): membuat N unit sekaligus dalam satu transaksi; nomor seri hanya bila jumlah 1. `POST /assets` mengembalikan unit pertama di `data` + `meta.count/ids`; `createAsset` di api-client kini mengembalikan `{data, meta}`. Teruji: api 110, web 25, shared 31. |
| Foto aset | Migrasi aditif `20261113233857_asset_photos`: `asset_photos` (foto kondisi awal per unit) dan `asset_batch_photos` (foto contoh per kelompok pembelian = produk + tanggal perolehan); keduanya append-only (trigger `forbid_mutation`, foto baru = baris baru), maks. 5 per unit/kelompok, JPEG/PNG ≤ 3 MB (magic bytes divalidasi), disimpan bytea. API: `GET/POST /assets/:id/photos`, `GET /assets/:id/photos/:photoId`, `POST /assets/groups/:productId/photos?date=`, `GET .../photos/:photoId` (tulis = `asset.status`, baca = `asset.read`); `AssetDto.photoCount`, `AssetBatchDto.photos`. Web: `ui/PhotoStrip` di detail aset ("Foto kondisi awal") dan panel kelompok ("Foto contoh kelompok"), ikon foto per unit di daftar. Keputusan owner: foto tidak diminta saat input pembelian; ditambahkan belakangan. Foto aset selalu opsional (tidak diwajibkan, termasuk saat checkout). Belum dikerjakan: tombol foto aset di mobile (juga opsional). Rollback ada di akhir berkas migrasi. |
| Riwayat sewa & servis aset | Di detail aset (dialog dan `/assets/:id`) angka **Jumlah disewa** dan **Tiket servis** pada panel pemakaian bisa diklik (bila > 0 dan berwenang) → dialog rincian **Riwayat sewa** / **Riwayat servis**; tidak ada panel riwayat terbuka di depan. Sumber data: (`GET /assets/:id/rentals`, `order.read`: pesanan, penyewa, lokasi, periode, waktu keluar/kembali, kondisi keluar → kembali, catatan; hanya unit yang sudah dikirim, maks. 100) dan **Riwayat servis** (memakai `GET /service-tickets?assetId=`, `service.read`; biaya hanya untuk `asset.cost.read`). Panel tampil sesuai capability. Riwayat perubahan lama diganti nama menjadi "Riwayat perubahan". Teruji: e2e (rentals) + web 25. |
| Merek, batch, ukuran | Migrasi aditif `20261114090000_brand_batch_dimensions` (sudah diterapkan ke DB dev; rollback ada di akhir berkas): `assets.brand`/`batch_label`, `stock_receipts.batch_label`, `stock_receipt_items.brand`, `products.width_cm`/`height_cm` (CHECK: keduanya terisi atau kosong). Model tetap satu produk per ukuran/varian; merek dan label batch hanya atribut aset (bukan produk), sehingga stok, ketersediaan, dan alokasi tidak berubah. Penerimaan menurunkan `brand` (per item) dan `batchLabel` (per penerimaan) ke setiap unit; form Aset baru/ubah punya kolom sendiri. `GET /assets/breakdown` (`asset.read`): barang × `batchLabel` × `brand` → jumlah unit + `areaM2` (jumlah × lebar×tinggi cm / 10.000; null bila ukuran kosong), unit `RETIRED` tidak dihitung. `AssetBatchDto` kini memuat `batchLabels` dan `brands`. Web: modal `StockBreakdownModal` (tombol "Rekap stok" di `/assets`), kolom ukuran di `ProductModal`, merek/batch di `ReceiptModal`, `AssetModal`, detail aset dan penerimaan. Teruji: api 118 (5 baru di `stockBreakdown.test.ts`), shared 31, api-client 8, web 25; tsc api/web/shared/api-client/mobile, eslint, prettier lulus. Belum: tampilan modal/form diperiksa di browser; kabel tetap per unit (stok curah/tanpa QR per unit belum ada); label batch bukan entitas terpisah (teks bebas, dikelompokkan persis sama); `prisma generate` penuh tertunda karena dev API mengunci DLL engine (tipe/JS client sudah terbarui, jalankan ulang setelah dev API dihentikan). |
| Label QR: tanggal cetak | PDF label mencetak "Cetak dd/mm/yyyy hh:mm" (WIB, satu waktu per PDF) di bawah teks di samping QR (`assets/labels.ts`, `formatPrintedAt`). Nama berkas unik per cetak: server `Content-Disposition` `eventra-qr-labels-YYYYMMDD-HHmmss.pdf` (WIB) dan unduhan web memakai `timestampedFilename` (`lib/download.ts`, waktu perangkat) di detail aset, panel kelompok, dan penerimaan. Teruji: `labels.test.ts`, `download.test.ts`, header di `assets.test.ts`; tata letak PDF belum dilihat/dicetak. Logo di tengah QR belum dikerjakan (menunggu pilihan PDF saja atau PDF+PNG). |
| Catatan | Total di POS hanya perkiraan (server menghitung ulang). Produk maks. 100 (batas `pageSize`). Belum diperiksa visual di browser 360 px/desktop. |

## Asumsi Fase 08

- Satu instance API (rate limit dan job di memori); job idempoten sehingga aman bila ganda, tetapi rate limit tidak dibagi antar instance.
- `ErrorReporter` default menulis log JSON; belum ada Sentry/webhook (menunggu keputusan penyedia).
- Pengiriman email reset password dan gateway pembayaran tetap belum ada (butuh keputusan owner); refresh token web masih di `localStorage`.
- Uji beban dijalankan in-process terhadap DB lokal (bukan load generator terpisah di server target); angka latensi hanya indikatif.
- Hold expiry: stok sudah diabaikan oleh perhitungan ketersediaan walau job mati, sehingga kegagalan job tidak menyebabkan overbooking.
- Pendapatan memakai tanggal UTC (tidak berubah).

## Asumsi Fase 07

- Mobile hanya berbahasa Indonesia (label di `src/lib/labels.ts`); i18n EN/ID belum diterapkan di mobile.
- PIC lapangan tidak punya `warehouse.read`, sehingga tidak melihat dokumen serah-terima di mobile (RBAC tidak diperluas).
- Foto insiden yang sudah terunggah hanya tampil sebagai jumlah (belum ada pratinjau blob).
- Tanda tangan dokumen, notifikasi dalam aplikasi (lonceng), dan push notification belum ada di mobile.
- Tidak ada test UI komponen React Native (tanpa test renderer); komponen diverifikasi lewat typecheck, lint, dan bundling.

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

## Verifikasi terakhir (Fase 08, 12 November 2026)

| Perintah | Hasil |
| --- | --- |
| `eslint .` / `prettier --check .` | Lulus |
| `tsc` di api, web, shared, api-client, mobile | Lulus |
| Test shared / api / api-client / web / mobile | Lulus: 25 / 105 / 8 / 13 / 16 (api 11 file termasuk hardening, load, e2e) |
| `tsup` api, `vite build` web | Lulus; peringatan bundle web >500 kB belum blocker |
| `ops/backup.sh` + `ops/restore-verify.sh` (DB dev, Docker) | "RESTORE OK": 36 tabel, trigger, migrasi identik |
| Server API dijalankan (NODE_ENV=production) | `/health/ready` 200, header keamanan + request id, log JSON bersih dari token |

**Belum terverifikasi penuh:** (1) `pnpm check` utuh berhenti di `prisma generate` (EPERM) karena dev API (tsx watch, port 3000) mengunci DLL engine; lint dan format:check lulus lewat `pnpm check`, sisa tahap dijalankan terpisah dan hijau. Hentikan dev API lalu `pnpm check` bila ingin satu perintah utuh. (2) Tampilan halaman web Fase 02–06 dan PDF belum diperiksa visual di browser (≈360 px dan desktop); aplikasi mobile belum dijalankan di perangkat/emulator (kamera QR, izin, foto, tombol Back, offline). (3) UAT owner, uji restore di server target, dan pilot belum dilakukan (lihat `RELEASE_PLAN.md`). (4) Uji beban belum dijalankan terhadap server produksi/staging.

## Pekerjaan berikutnya

MVP selesai sesuai `WORK_QUEUE.md`. Langkah berikutnya bukan kode: jalankan UAT owner di staging (`RELEASE_PLAN.md` §3), putuskan item terbuka `RUNBOOK.md` §8 (penyedia email, gateway pembayaran, cookie httpOnly, object storage), lalu peluncuran bertahap. Backlog pasca-MVP ada di `WORK_QUEUE.md`.

## Catatan terbuka

- Refresh token web disimpan di `localStorage` (access token hanya di memori). Pertimbangkan cookie httpOnly saat hardening (Fase 08), bersama rate limit login yang belum ada.
- UI belum memiliki halaman manajemen user; pembuatan user lewat `POST /users` atau seed.

- Hard refresh (`Ctrl + F5`) bila favicon browser masih cached.
- `eventra-logo-dark.svg` adalah eksplorasi lama; jangan gunakan.
- Aset brand source frontend ada di `apps/web/src/assets/brand/`; root `assets/brand/` adalah referensi brand/dokumen.
- Harga perolehan aset hanya untuk owner/admin berwenang.

## Aturan pembaruan

Setelah pekerjaan material selesai atau terblokir, update dokumen ini dengan fakta terverifikasi: status, file/komponen, test yang dijalankan, keputusan, blocker, dan next step. Jangan menulis secret atau log mentah. Perbarui `WORK_QUEUE.md` bila status fase berubah.
