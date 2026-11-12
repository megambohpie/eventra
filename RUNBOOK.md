# Eventra — Runbook Produksi

Dokumen operasional untuk menjalankan, memantau, memulihkan, dan me-rollback Eventra. Baca bersama `RELEASE_PLAN.md` (rencana peluncuran + UAT).

## 1. Komponen

| Komponen    | Bentuk                                                | Catatan                                                                                                     |
| ----------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| API         | Node.js ≥ 22, `pnpm --filter @eventra/api build` → `node apps/api/dist/server.js` | **Satu instance.** Job berkala dan rate limit berada di memori proses (lihat §8). |
| Web         | `pnpm --filter @eventra/web build` → statis `apps/web/dist`                       | Sajikan lewat CDN/Nginx; `VITE_API_URL` ditanam saat build.                                      |
| Mobile      | Expo (`EXPO_PUBLIC_API_URL`)                                                      | Build rilis lewat EAS; API URL ditanam saat build.                                               |
| Database    | PostgreSQL 16                                                                     | Satu-satunya penyimpanan (termasuk foto dan tanda tangan sebagai `bytea`).                       |
| Reverse proxy | Wajib TLS (HTTPS)                                                               | Set `TRUST_PROXY` = jumlah hop proxy agar IP klien benar.                                        |

## 2. Checklist environment (API)

Validasi dilakukan saat start (`packages/shared/src/env.ts`); proses menolak start bila salah.

| Variabel       | Wajib        | Aturan                                                                                          |
| -------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| `NODE_ENV`     | Ya           | `production`.                                                                                   |
| `PORT`         | Tidak        | Default 3000.                                                                                   |
| `DATABASE_URL` | Ya           | Pengguna DB khusus aplikasi (bukan superuser); `?schema=public`; TLS bila DB di luar host/VPC. |
| `JWT_SECRET`   | Ya           | ≥ 32 karakter acak (`openssl rand -base64 48`). Nilai contoh `.env.example` ditolak di production. Mengganti nilai ini memaksa semua pengguna login ulang. |
| `CORS_ORIGINS` | Ya (prod)    | Daftar origin web dipisah koma, mis. `https://app.contoh.id`. Wildcard `*` ditolak.            |
| `TRUST_PROXY`  | Bila di balik proxy | Jumlah hop proxy tepercaya. Salah nilai = rate limit/audit memakai IP proxy.             |
| `LOG_LEVEL`    | Tidak        | `info` (default).                                                                               |

Web: `VITE_API_URL`. Mobile: `EXPO_PUBLIC_API_URL`. **Jangan** menyetel `VITE_DEMO_EMAIL` / `VITE_DEMO_PASSWORD` di build produksi (akun contoh di halaman login hanya untuk dev). Jangan commit `.env`.

Checklist sebelum go-live:

- [ ] `JWT_SECRET` unik produksi, tersimpan di secret manager.
- [ ] `CORS_ORIGINS` berisi hanya origin web produksi.
- [ ] TLS aktif end-to-end; HSTS sudah dikirim API (helmet).
- [ ] `SEED_ADMIN_PASSWORD` kuat, admin seed dijalankan sekali (`pnpm db:seed`) lalu password diganti dan variabel seed dihapus dari environment.
- [ ] Pengguna DB aplikasi tidak punya hak `SUPERUSER`/`CREATEDB`.
- [ ] Backup terjadwal aktif dan **uji restore** berhasil (§5).
- [ ] Pemantauan `/api/v1/health/ready` aktif (§4).

## 3. Deploy

1. Backup database (`pnpm ops:backup`) — **wajib** sebelum setiap migrasi (satu-satunya jalur rollback data, §6).
2. `pnpm install --frozen-lockfile`
3. `pnpm check` hijau pada commit yang dirilis.
4. `pnpm db:migrate` (`prisma migrate deploy`; hanya menerapkan migrasi baru, tidak pernah mereset).
5. Build dan restart API; sajikan build web baru.
6. Smoke: `GET /api/v1/health/ready` = 200, login admin, buka `/dashboard`, cek log tidak ada `level":"error"`.

Migrasi bersifat aditif (tabel/kolom/trigger baru). Hindari deploy API lama terhadap skema baru; urutan: migrasi → API → web.

## 4. Observability

**Log:** satu baris JSON per entri di stdout/stderr (`ts`, `level`, `msg`, ...). Tiap request: `id` (sama dengan header `x-request-id`), `method`, `route` (template, mis. `/api/v1/assets/scan/:token`), `status`, `ms`, `user`. Token QR, token reset, dan query string **tidak** pernah masuk log. Arahkan stdout/stderr ke agregator (Loki/ELK/CloudWatch) dengan retensi ≥ 30 hari.

**Error monitoring:** semua error tak terduga (500), job yang gagal, `unhandledRejection`, dan `uncaughtException` lewat satu `ErrorReporter` (`apps/api/src/ops/errorReporter.ts`) → log `level":"error","msg":"unhandled_error"` berisi `requestId`, rute, user, stack. Untuk Sentry/webhook, implementasikan `ErrorReporter` dan teruskan ke `createApp` di `server.ts`. Pasang alert pada pola `"level":"error"`.

**Health:**

| Endpoint                | Arti                                                                            | Pemakaian             |
| ----------------------- | ------------------------------------------------------------------------------- | --------------------- |
| `GET /api/v1/health/live`  | Proses hidup                                                                  | Liveness probe        |
| `GET /api/v1/health/ready` | 200 bila DB terjangkau **dan** semua job sehat; 503 + rincian job bila tidak | Readiness + uptime monitor |
| `GET /api/v1/health`       | Ringkas (DB saja)                                                             | Kompatibilitas        |

Job (di `/health/ready` → `jobs[]`): `hold-expiry` (60 dtk) dan `invoice-reminders` (15 mnt). `stale: true` bila tidak sukses dalam 3× interval atau gagal 3× berturut-turut; lihat `lastError`. Job dilewati bila putaran sebelumnya belum selesai.

**Alert yang disarankan:** `ready` ≠ 200 selama > 2 menit; lonjakan status 5xx; `RATE_LIMITED` (429) tinggi pada `/auth/login` (indikasi brute force); pertumbuhan ukuran DB (foto disimpan di DB).

## 5. Backup dan restore

Backup (format custom + checksum SHA-256, rotasi `KEEP`=14):

```bash
DB_CONTAINER=eventra-db-1 pnpm ops:backup          # Docker
DATABASE_URL=postgresql://... pnpm ops:backup      # server langsung (butuh pg_dump)
```

Jadwalkan harian (cron) dan salin ke penyimpanan terpisah dari server DB (mis. object storage terenkripsi). Target: RPO ≤ 24 jam; RTO ≤ 2 jam.

**Uji restore** (tidak menyentuh DB sumber; memulihkan ke DB sementara lalu membandingkan jumlah baris tiap tabel, trigger append-only, dan jumlah migrasi):

```bash
DB_CONTAINER=eventra-db-1 pnpm ops:restore-verify backups/eventra-XXXX.dump
```

Jalankan setiap bulan dan setelah perubahan skema besar. Bila backup lebih lama dari data terkini, selisih jumlah baris wajar — verifikasi terbaik dilakukan tepat setelah backup.

**Pemulihan nyata (bencana):**

1. Hentikan API (hindari tulis saat restore).
2. Buat DB kosong, `pg_restore --no-owner -d <db> <berkas.dump>`.
3. Periksa `SELECT count(*) FROM _prisma_migrations` dan jalankan `pnpm db:migrate` bila backup lebih tua dari kode.
4. Nyalakan API; cek `/health/ready`; jalankan smoke §3.6.
5. Data setelah titik backup hilang — catat jendela waktunya dan koordinasikan dengan owner (pesanan/pembayaran/scan pada jendela itu perlu dimasukkan ulang; scan event dan audit adalah sumber fakta bila tersimpan di log).

## 6. Rollback

- **Aplikasi (tanpa perubahan skema):** deploy ulang build sebelumnya.
- **Migrasi:** Prisma tidak punya migrasi "down". Semua migrasi Eventra aditif. Rollback = (a) bila migrasi baru saja diterapkan dan belum ada data baru: jalankan SQL rollback yang tercatat di komentar migrasi/`HANDOFF.md` (drop tabel/trigger/enum yang ditambahkan) lalu `prisma migrate resolve --rolled-back <nama_migrasi>`; (b) selain itu: restore backup pra-deploy (§5) dan deploy build sebelumnya.
- Trigger append-only (`forbid_mutation`) memblokir `UPDATE`/`DELETE` pada `audit_logs`, `scan_events`, riwayat status, dokumen serah-terima, tanda tangan, foto insiden, riwayat pembayaran. Koreksi data historis dilakukan dengan baris revisi/koreksi, **bukan** dengan menonaktifkan trigger. Menonaktifkan trigger hanya untuk pemulihan darurat oleh DBA dan wajib dicatat.
- Migrasi terakhir (Fase 08) `20261112080000_hardening_append_only`: rollback = tiga `DROP TRIGGER` pada komentar akhir file migrasi.

## 7. Prosedur insiden

| Gejala                                         | Pemeriksaan                                                                  | Tindakan                                                                                  |
| ---------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `/health/ready` 503, `db: down`                | Status PostgreSQL, koneksi, disk                                              | Pulihkan DB; API pulih otomatis.                                                          |
| `/health/ready` 503, job `stale`               | `jobs[].lastError`, log `unhandled_error` dengan `route` = nama job            | Perbaiki penyebab; restart API bila macet. Hold kadaluarsa tetap diabaikan oleh perhitungan stok walau job mati, jadi tidak ada overbooking. |
| Pengguna terkunci `429 RATE_LIMITED`           | Header `Retry-After`; log `/auth/login` status 429                             | Tunggu jendela (15 mnt) atau restart API untuk mereset penghitung (hanya bila yakin bukan serangan). |
| Dugaan kebocoran token QR aset                 | —                                                                              | `POST /assets/:id/qr/regenerate` (token lama langsung tidak berlaku) lalu cetak ulang label. |
| Dugaan akun disalahgunakan                     | `audit_logs` per `actor_id`, `ip`, `device`                                    | Nonaktifkan user (efek langsung, sesi dicabut saat refresh); reset password.             |
| `JWT_SECRET` bocor                             | —                                                                              | Ganti nilai dan restart: semua access token tidak sah; cabut refresh token (`UPDATE refresh_tokens SET revoked_at = now()`). |
| Selisih stok saat scan                          | `scan_events` (REJECTED), pick list, riwayat aset                              | Ikuti alur `MISSING`/berita acara; jangan edit data historis.                             |

## 8. Batasan yang diketahui dan keputusan terbuka

- **Single instance:** rate limit dan penjadwal job berada di memori. Bila API di-scale horizontal: pindahkan rate limit ke Redis, dan pastikan hanya satu instance menjalankan job (job idempoten dan aman bersamaan — klaim atomik per pesanan/invoice — tetapi menggandakan beban).
- **Refresh token web di `localStorage`:** rentan XSS; mitigasi: CSP ketat bawaan helmet di API, tidak ada HTML dari pengguna yang dirender. Opsi hardening lanjutan: cookie httpOnly + proteksi CSRF (perlu perubahan web dan mobile, belum dikerjakan).
- **Email reset password:** antarmuka `Mailer` siap, **belum ada penyedia** (di production tidak ada token yang dicetak). Perlu keputusan owner (SMTP/penyedia API); sampai itu admin harus membantu pengguna yang lupa password secara manual (belum ada endpoint ganti password oleh admin).
- **Gateway pembayaran:** `settlePayment` adalah titik masuk tunggal; belum ada penyedia/webhook. Pembayaran dicatat manual oleh admin.
- **Pengingat ke pelanggan (WhatsApp/email):** baru notifikasi dalam aplikasi.
- **Foto/tanda tangan di database:** nyaman untuk MVP; pantau ukuran DB dan pindah ke object storage bila > beberapa GB.
- **Zona waktu laporan:** UTC.
- **Antrean offline mobile:** tidak ada (scan harus divalidasi server).
