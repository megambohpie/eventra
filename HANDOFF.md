# Eventra — Handoff Proyek

Dokumen ini adalah sumber ringkas keadaan proyek untuk manusia, Codex, Claude Code, atau agen lain. Baca sebelum implementasi agar pekerjaan tidak diulang.

**Terakhir diperbarui:** 11 November 2026  
**Status:** Fase 00 dan Fase 01 (identity, RBAC, master data) selesai dan terverifikasi; Fase 02 (aset/QR) belum dimulai dan menunggu persetujuan owner.

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
| Schema | Migrasi `20261111111805_identity_master_data` (aditif): `users`, `refresh_tokens`, `password_reset_tokens`, `customers`, `customer_contacts`, `categories`, `locations`, `products`. Rollback = drop tabel tersebut + hapus enum `Role`, `CustomerType`, `PricingUnit`. |
| RBAC | Role = enum DB; capability dipetakan di `packages/shared/src/rbac.ts` (Owner baca-saja, Admin penuh, Koordinator/Gudang baca sebagian). API memakai `requireCapability`, web memakai `RequireCapability` + `useAuth().can`. |
| Auth | Login JWT akses 15 menit; refresh token acak (hash saja di DB, 7 hari) dirotasi, pemakaian ulang token lama mencabut semua sesi. Status/role user dibaca dari DB tiap request. Reset password: token sekali pakai 1 jam, mencabut semua sesi. |
| Reset password | Belum ada pengiriman email: antarmuka `Mailer` di `routes/auth.ts`; di dev token dicetak ke log API, di production tidak dicetak. Implementasi nyata ditunda ke Fase 08. |
| Pelanggan/PIC | PIC wajib minimal satu saat pelanggan dibuat; PIC aktif terakhir tidak dapat dinonaktifkan (409, dikunci dengan `FOR UPDATE`). PIC dinonaktifkan, bukan dihapus. |
| Produk | Harga/deposit integer rupiah (kolom `BigInt`, DTO `number`); satuan `PCS`/`PACKAGE` + label. Kategori dengan produk tidak bisa dihapus. |
| Audit | Semua operasi tulis dan login/reset menulis `audit_logs` (password/token disaring). |
| Web | Rute `/login`, `/forgot-password`, `/reset-password`, `/customers`, `/products`, `/master`; Axios client memuat auth interceptor + refresh sekali-bersama. |
| Admin pertama | `pnpm db:seed` memakai `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` dari `.env` (lihat `.env.example`; `JWT_SECRET` ≥ 32 karakter wajib). |
| Test API | Memakai database terpisah `eventra_test` (dibuat otomatis oleh `test/globalSetup.ts`; override dengan `TEST_DATABASE_URL`). Butuh Postgres dev berjalan. |

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

## Verifikasi terakhir (Fase 01, 11 November 2026)

| Perintah | Hasil |
| --- | --- |
| `pnpm lint` / `pnpm format:check` | Lulus |
| `tsc` di api, web, mobile, shared, api-client | Lulus |
| Test shared / api / api-client / web | Lulus: 3 / 27 / 6 / 13 |
| `tsup` (api) dan `build` web | Lulus; peringatan bundle >500 kB belum blocker |
| Smoke HTTP pada build API (port 3001, DB dev) | health 200; login admin seed berhasil; tanpa token 401; pelanggan tanpa PIC 400; preflight CORS 204 |

**Belum terverifikasi penuh:** `pnpm check` utuh gagal pada langkah `prisma generate` karena server dev API lama (proses `tsx`, port 3000) mengunci `query_engine-windows.dll.node` (EPERM). Semua tahap lain dijalankan terpisah dan hijau. Hentikan server dev itu lalu jalankan ulang `pnpm check` untuk konfirmasi. Server tersebut juga masih memakai kode sebelum Fase 01; restart agar memuat auth.

## Pekerjaan berikutnya

Ikuti `WORK_QUEUE.md`. Fase 02 (aset, QR, riwayat kondisi) dimulai hanya setelah owner menyetujui hasil Fase 01. Mobile belum memakai login/auth (Fase 07).

## Catatan terbuka

- Refresh token web disimpan di `localStorage` (access token hanya di memori). Pertimbangkan cookie httpOnly saat hardening (Fase 08), bersama rate limit login yang belum ada.
- UI belum memiliki halaman manajemen user; pembuatan user lewat `POST /users` atau seed.

- Hard refresh (`Ctrl + F5`) bila favicon browser masih cached.
- `eventra-logo-dark.svg` adalah eksplorasi lama; jangan gunakan.
- Aset brand source frontend ada di `apps/web/src/assets/brand/`; root `assets/brand/` adalah referensi brand/dokumen.
- Harga perolehan aset hanya untuk owner/admin berwenang.

## Aturan pembaruan

Setelah pekerjaan material selesai atau terblokir, update dokumen ini dengan fakta terverifikasi: status, file/komponen, test yang dijalankan, keputusan, blocker, dan next step. Jangan menulis secret atau log mentah. Perbarui `WORK_QUEUE.md` bila status fase berubah.
