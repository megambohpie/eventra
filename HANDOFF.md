# Eventra — Handoff Proyek

Dokumen ini adalah sumber ringkas keadaan proyek untuk manusia, Codex, Claude Code, atau agen lain. Baca sebelum implementasi agar pekerjaan tidak diulang.

**Terakhir diperbarui:** 11 November 2026  
**Status:** foundation frontend/backend tersedia dan dapat dijalankan lokal; fitur bisnis MVP belum diimplementasikan.

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

## Keputusan yang wajib dijaga

- Fokus utama: kontrol aset rental event untuk owner.
- Stack: React web, React Native mobile, Node.js/TypeScript API, PostgreSQL, Axios, DaisyUI/Tailwind di web.
- Gunakan Axios dan alias `@/` pada frontend; jangan memakai `fetch` atau import relative panjang.
- UI web wajib menggunakan DaisyUI.
- Logo yang sah untuk light maupun dark mode: `eventra-logo-v5.svg`. Di dark mode logo ditempatkan di surface terang; yang berubah hanya token UI.
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

## Verifikasi terakhir

| Perintah | Hasil |
| --- | --- |
| `pnpm.cmd --filter @eventra/web typecheck` | Lulus |
| `pnpm.cmd --filter @eventra/web test` | Lulus, 10 test |
| `pnpm.cmd --filter @eventra/web build` | Lulus; peringatan bundle >500 kB belum blocker |
| `GET /api/v1/health` | 200, API dan database `ok` |
| `GET /eventra-icon.svg` | 200 |

## Pekerjaan berikutnya

Ikuti `WORK_QUEUE.md`. Mulai dari Fase 00 (quality gates dan mobile), lalu Fase 01 (auth, RBAC, master data). Jangan memulai aset/QR/pesanan sebelum dependency Fase 01 selesai, kecuali owner mengubah prioritas.

## Catatan terbuka

- Hard refresh (`Ctrl + F5`) bila favicon browser masih cached.
- `eventra-logo-dark.svg` adalah eksplorasi lama; jangan gunakan.
- Aset brand source frontend ada di `apps/web/src/assets/brand/`; root `assets/brand/` adalah referensi brand/dokumen.
- Harga perolehan aset hanya untuk owner/admin berwenang.

## Aturan pembaruan

Setelah pekerjaan material selesai atau terblokir, update dokumen ini dengan fakta terverifikasi: status, file/komponen, test yang dijalankan, keputusan, blocker, dan next step. Jangan menulis secret atau log mentah. Perbarui `WORK_QUEUE.md` bila status fase berubah.
