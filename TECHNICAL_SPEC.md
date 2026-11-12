# Eventra — Spesifikasi Teknis Implementasi

**Status:** Siap dikerjakan  
**Sumber kebutuhan:** `PRD.md`  
**Prinsip utama:** sistem kontrol aset rental untuk owner; pesanan adalah sumber pergerakan aset dan pendapatan.

## 1. Arsitektur

Monorepo JavaScript/TypeScript dengan API REST.

```text
apps/
  web/       React + Vite + Tailwind CSS + DaisyUI
  mobile/    React Native (Expo)
  api/       Node.js + TypeScript + Express.js
packages/
  api-client/  Axios client, types, API hooks bersama
  shared/      konstanta, validasi, type/domain bersama
docs/          dokumentasi tambahan bila diperlukan
```

- **Web:** dashboard owner, admin, gudang, dan laporan. Semua tampilan memakai DaisyUI/Tailwind; styling dipisah dari logika di `apps/web/src/styles/` (kelas semantik `ev-*` memakai `@apply`), sehingga tema/tampilan dapat diganti tanpa mengubah komponen.
- **Branding web:** gunakan `eventra-logo-v5.svg` lewat komponen `Logo`: warna asli tanpa kotak pada light mode, dan inversi terang tanpa kotak putih pada dark mode agar wordmark terbaca. Gunakan `eventra-icon.svg` pada favicon/loading dan `eventra-theme.css` sebagai satu-satunya sumber token warna DaisyUI.
- **Mobile:** aplikasi operasional untuk gudang dan PIC lapangan. DaisyUI tidak mendukung React Native; gunakan komponen native dengan token desain yang sama.
- **API:** Node.js + Express.js + TypeScript, REST, validasi request, RBAC, audit log.
- **Database:** PostgreSQL + ORM Prisma.
- **File:** object storage kompatibel S3 untuk foto kerusakan, bukti scan, PDF, serta tanda tangan dokumen.
- **PDF/QR:** generator QR dan PDF dari backend; browser/mobile hanya mengunduh, mencetak, atau membagikan hasil.

## 2. Aturan Implementasi Wajib

- Gunakan TypeScript untuk seluruh aplikasi baru; jangan menggunakan `any` kecuali diberi alasan eksplisit.
- Seluruh request HTTP menggunakan Axios dari `packages/api-client`; tidak memanggil `fetch` langsung.
- Semua endpoint dilindungi autentikasi kecuali login/refresh token dan endpoint publik yang kelak disetujui.
- Jangan menghapus audit log, allocation, scan event, atau dokumen serah-terima. Koreksi memakai event/dokumen revisi.
- Setiap perubahan status aset, pesanan, tiket, pembayaran, atau dokumen menghasilkan audit log.
- UI web menggunakan DaisyUI untuk semua kontrol standar. Jangan membuat button, modal, input, table, badge, atau alert custom bila DaisyUI menyediakannya.
- Tidak boleh menandai barang keluar/kembali tanpa verifikasi hasil scan dan identitas pelaksana.

## 3. Peran dan Akses

| Peran | Hak utama |
| --- | --- |
| Owner | Baca semua dashboard aset/keuangan, laporan, dan detail audit; dapat diberi hak persetujuan khusus. |
| Admin | Kelola master data, pesanan, penawaran, pembayaran, aset, user, dan laporan. |
| Koordinator operasional | Jadwal, work order, penugasan PIC, review insiden, dan penggantian aset. |
| Staf gudang | Pick list, scan keluar/kembali, kondisi aset, dan dokumen serah-terima. |
| PIC lapangan | Tugas assigned, scan penerimaan/pra-pengembalian, laporan insiden, dan penerimaan barang pengganti. |
| Pelanggan/penyewa | Profil, permintaan sewa, penawaran, invoice, pembayaran, dan status pesanan sendiri. |

Gunakan izin berbasis capability (`asset.read`, `asset.checkout`, `order.approve`, dan seterusnya), bukan pemeriksaan nama role tersebar di UI/API.

## 4. Model Data Inti

Tabel memakai `id` UUID, `created_at`, `updated_at`; entitas operasional juga memiliki `created_by` bila relevan.

| Entitas | Field/relasi penting |
| --- | --- |
| `users` | nama, email/telepon, password hash, status, role. |
| `customers` | individu/perusahaan, alamat, data verifikasi. |
| `products` | produk yang disewa, kategori, satuan sewa, harga, deposit. |
| `product_bundles` | aturan konversi satuan sewa ke komponen/aset fisik. |
| `assets` | kode aset, QR token, produk, serial, tanggal/biaya perolehan, sumber penerimaan, kondisi, status, lokasi terakhir. |
| `stock_receipts` / `stock_receipt_items` | penerimaan stok/aset dari pembelian, transfer, hibah, titipan, produksi, atau sumber lain; referensi dokumen, sumber, penerima, produk, jumlah, dan biaya perolehan opsional. |
| `asset_status_events` | perubahan status/lokasi/kondisi aset; append-only. |
| `orders` | penyewa, periode, lokasi, status, nilai total, status pembayaran. |
| `order_items` | produk, qty satuan sewa, harga, total. |
| `stock_allocations` | pesanan, produk/aset, tanggal, qty, status hold/confirmed/released. |
| `order_pics` | PIC per pesanan (rental atau customer): peran, kontak, sumber PIC, penyetuju. PIC tidak disimpan di `customers`. |
| `pick_lists` / `pick_list_items` | kebutuhan fisik, aset terpilih, hasil persiapan. |
| `scan_events` | QR, aksi, aset, pesanan, pelaksana, waktu, lokasi, kondisi. |
| `handover_documents` | dokumen keluar/kembali, nomor, payload snapshot, file PDF, penandatangan, versi. |
| `incidents` | aset rusak, pelapor, urgensi, deskripsi, lokasi, status, keputusan admin. |
| `incident_photos` | maksimum lima foto per insiden. |
| `service_tickets` | aset, keluhan, biaya, vendor, tindakan, status. |
| `replacement_tasks` | insiden, aset lama, aset pengganti, status pengiriman/terima. |
| `invoices` / `payments` | nilai tagihan, jatuh tempo, pembayaran, referensi gateway. |
| `audit_logs` | aktor, aksi, entity, entity id, before/after terfilter, IP/device bila tersedia. |

### Invarian kritis

1. QR hanya menyimpan token acak; tidak boleh berisi harga beli, data pelanggan, atau data sensitif.
2. Satu aset hanya boleh berada pada satu alokasi aktif pada satu waktu.
3. Alokasi tanggal tidak boleh melampaui stok yang tersedia pada tanggal tersebut.
4. Aset `Dalam servis`, `Karantina/rusak`, atau `Pensiun/dijual` tidak dapat dialokasikan.
5. `incidents` hanya boleh memiliki 1–5 foto; backend wajib menegakkan batas ini.
6. Dokumen yang sudah ditandatangani bersifat immutable; revisi membuat versi baru/berita acara.
7. Pendapatan diterima = pembayaran sukses/terverifikasi; tagihan yang belum lunas adalah piutang, bukan pendapatan.
8. Penerimaan stok menambah kuantitas hanya setelah dokumen penerimaan diselesaikan; aset per-unit yang diterima harus memperoleh kode aset dan QR token unik.

## 5. State Machine

### Pesanan

`DRAFT → PENDING_REVIEW → QUOTED → AWAITING_PAYMENT → CONFIRMED → SCHEDULED → IN_PROGRESS → COMPLETED`

Terminal/alternatif: `REJECTED`, `CANCELLED`, `EXPIRED`, `ISSUE`.

### Aset

`AVAILABLE → RESERVED → PREPARED → CHECKED_OUT → IN_TRANSIT → ON_SITE → RETURN_PENDING → AVAILABLE`

Alternatif: `IN_SERVICE`, `QUARANTINED`, `RETIRED`, `ISSUE_ON_SITE`.

Setiap transisi harus divalidasi pada backend dan direkam sebagai event.

## 6. Ketersediaan dan Alokasi Stok

1. Permintaan memuat `start_at`, `end_at`, item, dan kuantitas satuan sewa.
2. API mengonversi item ke satuan pemenuhan melalui `product_bundles`.
3. Untuk setiap tanggal terpengaruh, hitung `stok_total - alokasi CONFIRMED - hold aktif`.
4. Kuantitas maksimal = nilai sisa paling kecil di seluruh tanggal rentang sewa.
5. Saat pesanan dikonfirmasi, buat alokasi `CONFIRMED` atomik di dalam transaksi database. Jika salah satu tanggal tidak cukup, batalkan seluruh transaksi.
6. Hold pembayaran memiliki `expires_at`; worker terjadwal melepaskan hold kadaluarsa.
7. Prioritas adalah hold aktif paling awal, kemudian waktu konfirmasi. Jangan menentukan prioritas dari urutan tampilan frontend.

Contoh konfigurasi: produk LED `1 meter` memiliki rasio `4 panel`. Pesanan 4 meter membutuhkan 16 aset panel; kuota dan pick list dihitung terhadap 16 panel tersebut.

## 7. API REST v1

Format respons sukses: `{ "data": ... }`. Error: `{ "error": { "code", "message", "fields?" } }`.

| Area | Endpoint minimum |
| --- | --- |
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /me` |
| Master | `/products`, `/product-bundles`, `/assets`, `/customers`, `/users` |
| Penerimaan stok | `/stock-receipts`, `POST /stock-receipts/:id/receive`, `GET /stock-receipts/:id` |
| Availability | `POST /availability/check`, `GET /availability/calendar` |
| Orders | `/orders`, `/orders/:id/quote`, `/orders/:id/confirm`, `/orders/:id/pics` |
| Warehouse | `/pick-lists`, `/pick-lists/:id/scan`, `/handover/checkout`, `/handover/return` |
| Assets | `GET /assets/:id`, `GET /assets/:id/history`, `POST /assets/:id/qr/regenerate` |
| Incidents | `/incidents`, `/incidents/:id/photos`, `/incidents/:id/review`, `/incidents/:id/replacement` |
| Service | `/service-tickets` |
| Finance | `/invoices`, `/payments`, `/reports/revenue`, `/reports/receivables` |
| Owner dashboards | `/dashboards/owner`, `/dashboards/asset-movements` |
| Documents | `GET /handover-documents/:id/pdf`, `POST /handover-documents/:id/sign` |

Semua endpoint tulis wajib memeriksa permission, validasi schema (Zod), dan mencatat audit log.

## 8. Alur Scan dan Dokumen

### Barang keluar

1. Gudang membuat pick list dari pesanan terkonfirmasi.
2. Staf scan QR aset untuk memilih aset spesifik; sistem menolak aset berstatus tidak layak.
3. Scan verifikasi akhir membandingkan aset hasil scan dengan pick list.
4. Jika sama, API membuat `scan_events`, transisi aset, dan PDF berita acara/surat jalan.
5. PIC gudang keluar dan PIC penerima menandatangani dokumen; simpan bukti tanda tangan.

### Barang kembali

1. PIC lapangan boleh melakukan scan pra-pengembalian.
2. Gudang scan semua aset saat diterima, isi kondisi dan foto bila perlu.
3. Ketidaksesuaian menghasilkan event/insiden, bukan menghapus item dari dokumen.
4. API membuat PDF berita acara pengembalian untuk tanda tangan PIC gudang kembali dan pihak pengembali.

### Kerusakan dan penggantian

PIC lapangan scan aset → lampirkan 1–5 foto → admin review → buat tugas pengganti → gudang scan pilih/scan verifikasi aset pengganti → PIC lapangan scan terima. Aset lama dan pengganti selalu ditautkan ke tiket yang sama.

## 9. Frontend

### Web routes minimum

- `/login`
- `/owner/dashboard`, `/owner/assets`, `/owner/finance`
- `/orders`, `/orders/:id`, `/calendar`
- `/assets`, `/assets/:id`, `/assets/:id/history`
- `/stock-receipts`, `/stock-receipts/new`, `/stock-receipts/:id`
- `/warehouse/pick-lists/:id`, `/warehouse/check-out`, `/warehouse/returns`
- `/incidents`, `/service-tickets`, `/reports`

Gunakan role guard pada route dan capability guard pada aksi. Status selalu memakai badge DaisyUI dan warna yang didefinisikan satu kali dalam konstanta bersama.

Semua halaman web aplikasi menampilkan footer konsisten: `Sistem ini dibuat oleh PT Trijaya Digital Koneksindo.` Footer memakai komponen/utility DaisyUI/Tailwind dan tidak mengganggu tampilan cetak dokumen operasional.

### Mobile screens minimum

- Login dan tugas saya
- Pemindai QR
- Detail pick list/tugas
- Scan keluar, scan terima, scan kembali
- Laporan insiden dengan 1–5 foto
- Penerimaan aset pengganti

## 10. Keamanan dan Operasional

- Password: Argon2/bcrypt; token singkat + refresh token yang dapat dicabut.
- Upload: validasi MIME, ukuran, ownership; URL bertanda tangan untuk file privat.
- Harga beli hanya untuk owner/admin yang berwenang.
- Nominal uang simpan sebagai integer rupiah, bukan float.
- Gunakan timezone `Asia/Jakarta` untuk UI/bisnis; simpan timestamp UTC di database.
- Buat backup PostgreSQL harian dan uji restore sebelum produksi.
- Tambahkan structured logging, correlation id, dan error monitoring sebelum peluncuran.

## 11. Pengujian dan Definition of Done

- Unit test: konversi paket, ketersediaan tanggal, state machine, izin, perhitungan piutang.
- Integration test: transaksi alokasi stok bersamaan, scan keluar/kembali, insiden dan replacement, PDF snapshot.
- E2E web: owner dashboard, pesanan sampai checkout, pengembalian, dan pelaporan kerusakan.
- E2E mobile: scan QR valid/tidak valid dan unggah 1–5 foto.
- Lint, typecheck, unit test, dan build seluruh aplikasi harus lulus sebelum fase dinyatakan selesai.
- Setiap perubahan menyertakan migrasi database yang reversible atau rencana rollback jelas.

## 12. Keputusan yang Masih Menunggu Owner

- Apakah harga LED dihitung per meter linear atau meter persegi, dan rumus panelnya?
- Lama hold pembayaran dan kebijakan pembatalan.
- Metode pembayaran/gateway serta aturan verifikasi manual.
- Batas ukuran foto dan retensi file/dokumen.
- Aturan penyusutan nilai aset dan format nomor dokumen.
