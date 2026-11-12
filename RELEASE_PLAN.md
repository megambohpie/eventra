# Eventra — Rencana Peluncuran dan UAT

Pelengkap `RUNBOOK.md`. Persetujuan UAT adalah keputusan owner; dokumen ini menyiapkan skenarionya.

## 1. Gerbang rilis

| Gerbang                                                          | Bukti                                                                         | Status |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------ |
| `pnpm check` hijau pada commit rilis                             | Output lint, format, typecheck, test, build                                   | Otomatis |
| Uji keamanan akses/unggah/QR/rate limit/audit                    | `apps/api/src/hardening.test.ts`                                              | Otomatis |
| Uji beban konfirmasi + ketersediaan serentak                     | `apps/api/src/load.test.ts` (`LOAD_FACTOR=n` untuk skala lebih besar)         | Otomatis |
| E2E smoke alur kritis                                            | `apps/api/src/e2e.test.ts`                                                    | Otomatis |
| Backup → restore berhasil                                        | `pnpm ops:backup` + `pnpm ops:restore-verify` ("RESTORE OK")                  | Manual di server target |
| UAT owner (§3) dan UAT mobile di perangkat nyata                 | Lembar UAT bertanda tangan                                                    | **Owner** |
| Pemeriksaan visual web 360 px dan desktop                        | Checklist §3.3                                                                | **Owner/QA** |

## 2. Urutan peluncuran

1. **Staging** (mirror produksi, data dummy): deploy sesuai `RUNBOOK.md` §3; jalankan seluruh UAT.
2. **Freeze:** tidak ada perubahan kode setelah UAT disetujui; catat commit/tag rilis.
3. **Produksi — persiapan (H-1):** checklist environment (`RUNBOOK.md` §2), backup pertama, uji restore, pasang monitoring + alert.
4. **Produksi — go-live:** backup pra-deploy → migrasi → API → web → smoke (`RUNBOOK.md` §3.6) → seed admin pertama → ganti password.
5. **Data awal:** kategori, lokasi, produk, paket (komposisi); terima stok awal lewat Penerimaan Stok (QR per unit); cetak label dan tempel.
6. **Pilot terbatas (1–2 minggu):** satu-dua pesanan nyata, gudang dan PIC lapangan memakai mobile. Admin memantau log/alert harian; bandingkan stok fisik vs sistem.
7. **Rilis penuh:** setelah pilot tanpa insiden P1/P2. Latih Gudang, PIC lapangan, Koordinator, Owner.

**Kriteria rollback saat go-live:** `/health/ready` tidak pulih dalam 15 menit, login/scan gagal untuk semua pengguna, atau ketidakkonsistenan data terdeteksi. Tindakan: `RUNBOOK.md` §6.

## 3. Lembar UAT owner

Tandai `Lulus / Gagal` dan catat temuan. Skenario dijalankan pada staging.

### 3.1 Alur bisnis (web)

- [ ] Admin membuat kategori, lokasi, produk (harga, deposit), pelanggan.
- [ ] Terima stok 3 unit → 3 aset dengan kode `AST-…`; cetak label PDF; QR dapat dipindai.
- [ ] Buat pesanan, tunjuk PIC (penyewa, gudang keluar/kembali, lapangan), ajukan, penawaran, tahan stok.
- [ ] Stok 3, pesanan A 2 unit tanggal 1–2; pesanan B 2 unit tanggal 2–3 **ditolak** (tidak ada overbooking); kalender menampilkan keluar/kembali per tanggal.
- [ ] Buat invoice; bayar sewa dan deposit (sebagian dulu); status Belum dibayar → Sebagian → Lunas; pembayaran melebihi tagihan ditolak.
- [ ] Konfirmasi pesanan; jadwalkan.
- [ ] **Hold kadaluarsa:** tahan stok dengan batas 5 menit, tunggu; pesanan menjadi Kedaluwarsa dan stok kembali tersedia.

### 3.2 Gudang dan lapangan (mobile, perangkat nyata)

- [ ] Gudang login; "Tugas saya" menampilkan pick list.
- [ ] Scan pilih lalu verifikasi tiap aset; scan QR salah/aset di luar daftar **diblokir** dan tercatat.
- [ ] Checkout menghasilkan Surat Jalan; tanda tangan PIC di web; PDF berisi kode aset, kondisi, waktu, penandatangan.
- [ ] PIC lapangan melaporkan kerusakan (scan, deskripsi, 1–5 foto); 0 atau 6 foto ditolak.
- [ ] Admin memutuskan (panduan/teknisi/tolak/penggantian); alur penggantian sampai diterima PIC lapangan.
- [ ] Aset rusak yang kembali masuk karantina dan tidak bisa dipesan sebelum lolos pemeriksaan servis.
- [ ] Pengembalian: scan tiap aset, kondisi, foto; item kurang → konfirmasi selisih → berita acara; scan terlambat menerbitkan revisi.
- [ ] Mode pesawat: banner offline muncul, aksi tulis dinonaktifkan, kembali normal saat online.
- [ ] Izin kamera ditolak → pesan jelas + input kode manual hanya di tempat yang diizinkan.

### 3.3 Owner dan tampilan

- [ ] Dashboard: sebaran status aset, aset rusak, aset tanpa update, aset paling sering disewa/rusak; kalender drill-down.
- [ ] Laporan: pendapatan **diterima** (sewa) ≠ piutang; deposit terpisah; terlambat; angka cocok dengan pembayaran yang dicatat.
- [ ] Detail aset: umur, harga beli (hanya Owner/Admin), jumlah sewa, hari pakai, servis, insiden.
- [ ] Owner tidak dapat mengubah data (tombol tulis tidak tampil; API menolak).
- [ ] Peran lain: Gudang tidak melihat harga beli/keuangan; Koordinator tidak dapat menyetujui pesanan.
- [ ] Tampilan nyaman di lebar ≈ 360 px dan desktop; tanpa scroll horizontal; light dan dark; bahasa EN dan ID.

### 3.4 Keamanan (spot-check)

- [ ] 11 percobaan login salah berturut-turut dalam 15 menit → diblokir sementara.
- [ ] Setelah user dinonaktifkan, sesinya langsung tidak berlaku.
- [ ] Regenerasi QR membuat label lama tidak berlaku.

## 4. Pascarilis

- Minggu 1: tinjau log error harian, durasi job, ukuran DB, dan laporan pengguna.
- Bulan 1: uji restore, tinjau rate limit (sesuaikan `DEFAULT_RATE_LIMITS` di `ops/rateLimit.ts` bila terlalu ketat/longgar), putuskan item terbuka di `RUNBOOK.md` §8 (email reset, gateway, cookie httpOnly, object storage).
