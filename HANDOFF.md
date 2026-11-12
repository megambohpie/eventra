# Eventra — Handoff Proyek

Dokumen ini adalah sumber ringkas keadaan proyek untuk manusia, Codex, Claude Code, atau agen lain. Baca sebelum implementasi agar pekerjaan tidak diulang.

**Terakhir diperbarui:** 12 November 2026  
**Status:** Fase 00–03 (termasuk paket, ketersediaan, pesanan) selesai dan terverifikasi; Fase 04 belum dimulai dan menunggu persetujuan owner.

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

## Verifikasi terakhir (Fase 03, 12 November 2026)

| Perintah | Hasil |
| --- | --- |
| `eslint .` / `prettier --check .` | Lulus |
| `tsc` di api, web, mobile, shared, api-client | Lulus |
| Test shared / api / api-client / web | Lulus: 12 / 52 / 6 / 13 (api termasuk 13 test Fase 03 + konkurensi) |
| `vite build` web dan `tsup` api | Lulus; peringatan bundle >500 kB belum blocker |

**Belum terverifikasi penuh:** (1) `pnpm check` utuh gagal hanya di langkah `prisma generate` (EPERM) bila server dev API berjalan; Prisma client sudah ter-generate dan semua tahap lain dijalankan terpisah dan hijau. Hentikan `pnpm dev:api` sebelum menjalankan `pnpm check`. (2) Tampilan halaman Fase 02–03 belum diperiksa visual di browser (ponsel ≈360 px dan desktop). (3) Server dev API dihentikan saat verifikasi; jalankan ulang `pnpm dev:api`.

## Pekerjaan berikutnya

Ikuti `WORK_QUEUE.md`. Fase 04 (gudang, scan, PDF) dimulai hanya setelah owner menyetujui Fase 03; akan memakai alokasi `stock_allocations`, `order_pics` gudang, dan menggerakkan status aset RESERVED…RETURN_PENDING serta status pesanan IN_PROGRESS/COMPLETED. Mobile belum memakai login/auth (Fase 07).

## Catatan terbuka

- Refresh token web disimpan di `localStorage` (access token hanya di memori). Pertimbangkan cookie httpOnly saat hardening (Fase 08), bersama rate limit login yang belum ada.
- UI belum memiliki halaman manajemen user; pembuatan user lewat `POST /users` atau seed.

- Hard refresh (`Ctrl + F5`) bila favicon browser masih cached.
- `eventra-logo-dark.svg` adalah eksplorasi lama; jangan gunakan.
- Aset brand source frontend ada di `apps/web/src/assets/brand/`; root `assets/brand/` adalah referensi brand/dokumen.
- Harga perolehan aset hanya untuk owner/admin berwenang.

## Aturan pembaruan

Setelah pekerjaan material selesai atau terblokir, update dokumen ini dengan fakta terverifikasi: status, file/komponen, test yang dijalankan, keputusan, blocker, dan next step. Jangan menulis secret atau log mentah. Perbarui `WORK_QUEUE.md` bila status fase berubah.
