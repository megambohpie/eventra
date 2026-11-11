# Eventra — PRD Work Queue

**Cara pakai:** kerjakan berurutan. Satu item hanya boleh `Done` bila acceptance criteria dan verifikasi di bawahnya terpenuhi. Jangan memulai fase berikutnya tanpa persetujuan owner manusia terhadap hasil fase sebelumnya.

## Status

| Fase | Status | Fokus |
| --- | --- | --- |
| 00 | Todo | Foundation dan standar proyek |
| 01 | Todo | Auth, RBAC, master data |
| 02 | Todo | Aset dan QR lifecycle |
| 03 | Todo | Ketersediaan, paket, pesanan |
| 04 | Todo | Gudang, scan, dan PDF |
| 05 | Todo | Insiden, servis, penggantian |
| 06 | Todo | Dashboard owner dan keuangan |
| 07 | Todo | Mobile operasional |
| 08 | Todo | Hardening dan rilis |

## Definition of Ready untuk Setiap Item

- Referensi PRD/technical spec jelas.
- Dependency sudah selesai atau disepakati mock-nya.
- Perubahan schema/API/UI dan acceptance criteria disebutkan.
- Tidak ada keputusan bisnis yang belum dapat dijawab tanpa menebak.

## Fase 00 — Foundation dan Standar Proyek

- [ ] Buat monorepo `apps/web`, `apps/mobile`, `apps/api`, `packages/shared`, dan `packages/api-client`.
- [ ] Konfigurasi TypeScript strict, ESLint, Prettier, env validation, dan command lint/typecheck/test/build.
- [ ] Setup React/Vite web dengan Tailwind dan DaisyUI; buat tema serta layout dasar memakai DaisyUI.
- [ ] Setup Express API, Prisma, PostgreSQL, health endpoint, error handler, dan migrasi awal.
- [ ] Setup React Native/Expo dan API client Axios bersama.

**Selesai bila:** semua aplikasi build, API terhubung ke DB dev, dan CI lokal lulus lint/typecheck/test/build.

## Fase 01 — Identity, RBAC, dan Master Data

- [ ] Schema user, role, permission, customer, PIC penyewa, kategori, produk, dan lokasi.
- [ ] Login, refresh/logout, reset password, route guard, dan capability middleware.
- [ ] CRUD pelanggan dan minimal satu PIC penyewa wajib sebelum membuat pesanan.
- [ ] CRUD produk dengan harga per pcs/paket dan deposit.
- [ ] UI web seluruhnya menggunakan DaisyUI; Axios central client termasuk error/auth interceptor.

**Selesai bila:** user tak berizin ditolak API dan UI; admin dapat membuat pelanggan, PIC, dan produk; test izin serta validasi lulus.

## Fase 02 — Aset, QR, dan Riwayat Kondisi

- [ ] Schema aset, pembelian, kondisi, lokasi, status event, dan audit log.
- [ ] CRUD aset beserta tanggal beli, harga beli, serial, pemasok, kondisi awal, dan QR token.
- [ ] Penerimaan stok/aset dari pembelian, transfer, hibah, titipan, produksi, atau sumber lain; rekam asal, dokumen, penerima, jumlah, dan biaya perolehan opsional.
- [ ] Generate/cetak QR PDF/label dan halaman detail riwayat aset.
- [ ] API pemindaian QR aman serta status aset; data sensitif harga beli dibatasi.
- [ ] Dashboard/list aset dengan filter status, kondisi, lokasi, dan aset perlu perhatian.

**Selesai bila:** stok/aset dapat diterima dari sumber yang dipilih, aset per-unit memperoleh QR unik, dan riwayatnya memperlihatkan asal serta perubahan kondisi/status tanpa data sensitif bocor.

## Fase 03 — Paket, Ketersediaan, dan Pesanan

- [ ] Schema bundle/konversi serta order, item, quote, allocation, dan hold.
- [ ] Konfigurasi `1 satuan sewa → N aset fisik` (contoh 1 meter → 4 panel).
- [ ] API cek ketersediaan per tanggal, beserta jumlah maksimum yang tersedia.
- [ ] Transaksi atomic confirm order; release allocation saat batal/hold kadaluarsa.
- [ ] Calendar web stok keluar/kembali per tanggal dan detail klik tanggal.
- [ ] Manajemen PIC penyewa, gudang keluar/kembali, dan PIC lapangan (owner/penyewa/pihak ketiga).

**Selesai bila:** skenario stok 30, booking tanggal 8–9 sebanyak 15, lalu request 7–8 hanya mengizinkan 15; test konkurensi membuktikan tidak ada overbooking.

## Fase 04 — Gudang, Scan, dan Dokumen Serah-Terima

- [ ] Schema pick list, item aset, scan event, handover document, dan signature.
- [ ] Gudang memilih aset spesifik untuk pesanan dan scan saat persiapan.
- [ ] Verifikasi scan akhir sebelum keluar; blokir bila tidak sesuai pick list.
- [ ] Scan pengembalian, kondisi/foto, selisih, serta transisi aset.
- [ ] Buat PDF surat jalan/berita acara keluar dan kembali, nomor unik, cetak, dan tanda tangan PIC.
- [ ] Dokumen immutable setelah ditandatangani; revisi memakai berita acara/versi baru.

**Selesai bila:** scan salah/kurang memblokir serah-terima; PDF berisi asset code, kondisi, waktu, dan penandatangan; semua aktivitas memiliki audit log.

## Fase 05 — Insiden, Servis, dan Aset Pengganti

- [ ] Schema insiden, foto (validasi 1–5), service ticket, replacement task.
- [ ] PIC lapangan scan aset rusak, memilih urgensi, mengisi deskripsi, dan unggah 1–5 foto.
- [ ] Notifikasi/admin review dengan keputusan perbaikan, teknisi, tolak, atau penggantian.
- [ ] Pick list serta scan aset pengganti keluar dan scan diterima PIC lapangan.
- [ ] Hubungkan aset rusak/pengganti ke insiden dan catat tiket servis.

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
