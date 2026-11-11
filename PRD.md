# PRD — Eventra

**Produk:** Platform penyewaan videotron, sound system, dan perlengkapan event  
**Platform:** Web (React.js) dan mobile (React Native)  
**Status:** Draft v1  
**Tanggal:** 11 November 2026

## 1. Ringkasan

Eventra adalah sistem kontrol usaha rental event yang membantu owner memantau kondisi, lokasi, pemakaian, nilai, dan riwayat setiap aset—terutama videotron/LED screen, sound system, panggung, lighting, tenda, dan perlengkapan pendukung lain. Sistem juga mendukung proses sewa, agar seluruh pengeluaran, pengembalian, kerusakan, dan servis barang tercatat sebagai dasar keputusan owner.

Produk diluncurkan sebagai satu sistem dengan peran owner, admin/operasional, gudang, PIC lapangan, dan pelanggan. Web diprioritaskan sebagai dashboard owner dan back-office; aplikasi mobile diprioritaskan untuk eksekusi gudang serta lapangan.

### Fokus produk

Keberhasilan utama Eventra bukan hanya jumlah pesanan masuk, melainkan kemampuan owner mengetahui kondisi seluruh barang setiap saat: barang tersedia, keluar, berada di lokasi mana, dipegang oleh siapa, rusak, sedang diservis, atau siap dipakai kembali. Fitur pemesanan pelanggan mendukung pencatatan operasional tersebut.

## 2. Masalah yang Diselesaikan

- Pelanggan sulit mengetahui harga, ketersediaan, dan kecocokan peralatan sebelum menghubungi vendor.
- Proses sewa melalui chat/rawan salah catat, bentrok jadwal, dan lambat dalam pembuatan penawaran.
- Admin kesulitan memantau stok, status pesanan, pembayaran, serta pekerjaan tim lapangan dari satu tempat.
- Teknisi membutuhkan detail jadwal, lokasi, daftar peralatan, dan bukti pekerjaan yang mudah diakses di lokasi acara.
- Pemilik bisnis membutuhkan riwayat dan kondisi setiap unit aset yang dapat diaudit sejak pembelian hingga akhir masa pakai.

## 3. Tujuan dan Metrik Keberhasilan

### Tujuan produk

1. Membuat proses permintaan sewa hingga konfirmasi pesanan dapat dilakukan secara digital.
2. Mengurangi konflik jadwal peralatan melalui pemeriksaan ketersediaan berbasis tanggal dan waktu.
3. Memberi visibilitas operasional atas setiap pesanan dan tugas lapangan.
4. Memberi owner visibilitas real-time atas kondisi, lokasi, pemakaian, serta biaya perawatan aset.
5. Mempercepat pelanggan menemukan paket kebutuhan acara yang sesuai.

### Metrik awal (3–6 bulan setelah peluncuran)

- Minimal 60% permintaan sewa masuk melalui platform.
- Waktu respons penawaran rata-rata kurang dari 30 menit pada jam kerja.
- Tingkat pesanan dengan konflik ketersediaan kurang dari 2%.
- Minimal 40% pelanggan kembali melakukan pemesanan dalam 6 bulan.
- Kepuasan pelanggan (CSAT) minimal 4 dari 5.
- Minimal 95% aset terlacak memiliki status, lokasi terakhir, dan kondisi terakhir yang diperbarui.
- 100% aset rusak memiliki tiket insiden/servis dan PIC penanganan.

## 4. Pengguna dan Peran

| Peran | Kebutuhan utama |
| --- | --- |
| Owner | Melihat kesehatan aset, utilisasi, barang di luar gudang, kerusakan/servis, nilai aset, serta risiko operasional tanpa mengubah data harian. |
| Pelanggan | Mencari alat/paket, melihat estimasi harga, mengajukan sewa, membayar, serta memantau status pesanan. |
| Admin | Mengelola katalog, stok, harga, pesanan, pembayaran, pelanggan, dan laporan. |
| Koordinator operasional | Menjadwalkan pengiriman, pemasangan, pembongkaran, dan penugasan personel. |
| Teknisi/logistik | Melihat tugas lapangan, checklist alat, navigasi lokasi, unggah foto/bukti, serta memperbarui status pekerjaan. |

## 5. Ruang Lingkup MVP

### A. Pelanggan — Web dan Mobile

- Registrasi/login melalui email atau nomor ponsel; verifikasi OTP untuk nomor ponsel.
- Profil pelanggan dan data penagihan.
- Katalog berdasarkan kategori: videotron/LED screen, audio, lighting, panggung, tenda, dan aksesori.
- Halaman detail produk: foto, spesifikasi, satuan sewa, harga mulai, deposit, kapasitas/stok, dan rekomendasi perlengkapan terkait.
- Produk dapat memiliki harga sewa per pcs dan/atau per paket/satuan ukuran (misalnya meter persegi LED); sistem menampilkan konversi otomatis ke jumlah unit fisik yang harus dikeluarkan.
- Pencarian dan filter berdasarkan kategori, lokasi layanan, tanggal, kisaran harga, dan kapasitas acara.
- Keranjang sewa dengan durasi, tanggal/jam mulai–selesai, lokasi acara, jumlah unit, serta catatan kebutuhan.
- Pemeriksaan ketersediaan sebelum pengajuan pesanan.
- Pemesanan sebagai **permintaan penawaran**; harga final dapat direvisi admin untuk kebutuhan custom.
- Ringkasan biaya: biaya sewa, pengiriman, pemasangan, operator/teknisi, deposit, diskon, pajak, dan total.
- Pembayaran deposit/pelunasan melalui gateway pembayaran yang dipilih pada implementasi.
- Riwayat dan detail pesanan, invoice, status pembayaran, dan pelacakan status operasional.
- Notifikasi status pesanan, pembayaran, jadwal, dan pengingat pelunasan.
- Bantuan melalui WhatsApp/call-to-action customer service.

### B. Admin dan Operasional — Web

- Dashboard: jumlah permintaan, pesanan aktif, pendapatan, jatuh tempo pembayaran, dan pekerjaan hari ini.
- Dashboard pengeluaran barang per tanggal: kalender/grafik yang memperlihatkan jumlah unit dan jenis barang keluar, barang kembali, serta tugas lapangan pada setiap tanggal.
- Klik tanggal pada dashboard membuka rincian pesanan, daftar barang, jumlah keluar/kembali, lokasi acara, dan PIC terkait.
- Dashboard owner menampilkan ringkasan kesehatan aset: total aset, tersedia, keluar, di lokasi acara, bermasalah, dalam servis, dan pensiun; seluruh angka dapat dibuka ke daftar aset terkait.
- Dashboard owner menampilkan aset dengan kondisi buruk, insiden terbuka, servis jatuh tempo, aset paling sering disewa, aset paling sering rusak, serta aset tanpa pembaruan lokasi/kondisi.
- Owner dapat memantau tiap aset berdasarkan status, lokasi terakhir, pesanan aktif, PIC yang memegang, umur aset, harga beli, jumlah sewa, jumlah servis, dan biaya servis.
- Dashboard finansial owner menampilkan pendapatan sewa yang sudah diterima, nilai sewa pesanan aktif, total tagihan belum dibayar, tagihan jatuh tempo, dan pembayaran yang terlambat; angka dapat difilter per hari, bulan, tahun, serta cabang bila fitur cabang tersedia.
- Owner dapat membuka rincian piutang per pesanan: pelanggan, nomor invoice, total sewa, jumlah dibayar, sisa tagihan, tanggal jatuh tempo, status pembayaran, dan PIC penyewa.
- CRUD kategori, produk, paket, foto, spesifikasi, harga, deposit, dan add-on layanan.
- Pengelolaan inventaris per unit/kelompok stok, kondisi alat, dan status tersedia/dipesan/maintenance.
- Owner/admin dapat menambah stok melalui penerimaan barang dari pembelian, transfer, hibah, titipan, hasil produksi, atau sumber lain; setiap penerimaan menyimpan asal, tanggal, jumlah, dokumen, dan penanggung jawab.
- Pengaturan satuan sewa dan komposisi paket, misalnya produk “LED 1 meter” membutuhkan 4 pcs panel LED; harga dapat ditetapkan per pcs, per paket, atau keduanya.
- Kalender ketersediaan per produk/paket untuk mengidentifikasi bentrok jadwal.
- Kalender ketersediaan harian menampilkan stok total, unit yang sudah dialokasikan, dan sisa unit untuk setiap tanggal.
- Daftar pesanan dengan filter status, tanggal acara, pelanggan, dan pembayaran.
- Review permintaan, ubah item/kuantitas/biaya, buat penawaran, dan kirim penawaran ke pelanggan.
- Konfirmasi pembayaran (otomatis dari gateway bila tersedia; manual dengan unggah bukti sebagai cadangan).
- Penjadwalan pengiriman, pemasangan, standby acara, dan pembongkaran.
- Penugasan teknisi/logistik serta pencetakan/unduh work order.
- Penetapan PIC gudang untuk setiap proses barang keluar dan barang kembali, serta PIC lapangan untuk setiap pesanan.
- Pembuatan dokumen serah-terima barang keluar dan masuk/pengembalian dalam PDF yang dapat diunduh, dicetak, dan ditandatangani PIC terkait.
- Manajemen promo sederhana: kode promo, periode, nilai/persentase diskon, syarat minimum transaksi.
- Laporan dasar: pendapatan, pesanan, pemakaian item, pelanggan, dan piutang.

### C. Teknisi/Logistik — Mobile

- Login berbasis peran.
- Daftar tugas hari ini dan kalender tugas.
- Detail tugas: waktu, kontak pelanggan, lokasi/peta, item, catatan, dan penanggung jawab.
- Checklist muat alat, tiba lokasi, pemasangan, uji fungsi, pembongkaran, dan pengembalian.
- Pembaruan status pekerjaan serta unggah foto dokumentasi.
- Laporan kendala/kerusakan alat.
- Pelaporan kerusakan di lapangan melalui scan QR aset, deskripsi kondisi, tingkat urgensi, dan unggahan 1–5 foto sesuai kondisi kerusakan.

### D. Manajemen Aset Berbasis QR — Web dan Mobile

- Setiap unit fisik barang memiliki ID aset unik dan QR code unik; tingkat pelacakan dapat ditentukan per jenis alat (misalnya panel LED, speaker, mixer, kabel, atau flight case).
- QR dapat dibuat dan dicetak dari admin. Pemindaian melalui aplikasi mobile membuka detail aset sesuai hak akses pengguna.
- Detail aset mencakup nama/jenis, kode aset, serial number, tanggal beli, harga beli, pemasok, umur aset, kondisi terakhir, status, dan lokasi terakhir.
- Sistem menyimpan total penyewaan, total hari pemakaian, total servis, dan riwayat kerusakan setiap aset.
- Status aset minimum: `Tersedia`, `Direservasi`, `Keluar gudang`, `Dalam perjalanan`, `Di lokasi acara`, `Dalam servis`, `Karantina/rusak`, dan `Pensiun/dijual`.
- Saat barang keluar, petugas memindai QR. Sistem mencatat waktu, petugas pengeluar, pesanan, pelanggan/PIC, lokasi acara, serta kondisi awal dan foto bukti.
- Saat barang berpindah status/lokasi, teknisi dapat memindai QR dan memperbarui kondisi serta lokasi terakhir. Pada MVP lokasi berasal dari tugas/pesanan, bukan GPS real-time.
- Saat barang kembali, penerima memindai QR. Sistem mencatat waktu, penerima, kondisi kembali, foto bukti, dan catatan kekurangan/kerusakan.
- Staf gudang menyiapkan barang sebelum pengambilan/pengiriman dengan menetapkan kode aset spesifik kepada pesanan (*pick list*). Status aset berubah menjadi `Dialokasikan/disiapkan` tetapi belum dianggap keluar gudang.
- Sebelum barang dinaikkan ke kendaraan atau diserahkan ke penyewa, petugas melakukan scan ulang seluruh QR aset untuk memverifikasi kesesuaian dengan *pick list*. Serah-terima tidak dapat diselesaikan bila ada aset kurang, aset tidak sesuai, atau jumlah fisik tidak cocok.
- Menjelang pengembalian, PIC lapangan dapat melakukan scan pemeriksaan awal; hasilnya menjadi daftar barang yang diharapkan kembali. Alternatifnya, staf gudang melakukan scan pemeriksaan langsung ketika barang diterima kembali.
- Setelah scan keluar atau scan kembali tervalidasi, sistem membuat dokumen serah-terima resmi berisi daftar aset/kode QR, kondisi, selisih, waktu, lokasi, serta nama PIC. Dokumen tersedia dalam PDF untuk cetak dan tanda tangan basah, serta dapat menyimpan tanda tangan digital/foto dokumen bertanda tangan bila digunakan.
- Tiket servis mencatat masalah, vendor/teknisi servis, biaya, tanggal mulai/selesai, tindakan perbaikan, hasil pemeriksaan, dan foto sebelum/sesudah.
- Aset berstatus servis, karantina, atau pensiun tidak dapat dialokasikan ke pesanan baru.
- PIC lapangan dapat membuat laporan insiden aset dari lokasi acara. Admin menerima notifikasi, memeriksa laporan, lalu dapat menyetujui pengiriman pengganti; aset pengganti harus dipilih dan dipindai QR terhadap tugas penggantian sebelum keluar gudang.

## 6. Di Luar Ruang Lingkup MVP

- Marketplace multi-vendor.
- Optimasi rute otomatis dan pelacakan kendaraan real-time.
- Kontrak elektronik dengan tanda tangan digital tersertifikasi.
- Harga dinamis otomatis berbasis permintaan.
- Program loyalitas, referral, dan chat in-app penuh.
- Akuntansi lengkap dan integrasi ERP.

## 7. Alur Utama

1. Pelanggan memilih produk atau paket, menentukan jadwal dan lokasi acara.
2. Data penyewa dan PIC penyewa harus diinput serta tervalidasi sebelum permintaan sewa dapat dikirim.
3. Sistem memeriksa ketersediaan dan menampilkan estimasi biaya.
4. Pelanggan mengirim permintaan sewa.
5. Admin meninjau, menyesuaikan bila perlu, lalu mengirim penawaran.
6. Pelanggan menyetujui penawaran dan membayar deposit.
7. Sistem mengonfirmasi pesanan dan tim operasional menetapkan PIC gudang, PIC lapangan, jadwal, serta work order.
8. Teknisi menjalankan pengiriman/pemasangan dan mencatat bukti pekerjaan.
9. Setelah acara, tim melakukan pembongkaran/pengembalian; admin menyelesaikan pesanan dan deposit sesuai kebijakan.

### Status pesanan

`Draft → Menunggu review → Penawaran dikirim → Menunggu pembayaran → Dikonfirmasi → Dijadwalkan → Dalam proses → Selesai`

Status alternatif: `Dibatalkan`, `Ditolak`, `Kadaluarsa`, atau `Bermasalah`.

### Aturan ketersediaan dan prioritas sewa

Ketersediaan dihitung **per produk dan per tanggal**, bukan hanya berdasarkan tanggal mulai atau tanggal selesai. Suatu pesanan menggunakan kuota pada setiap hari dalam rentang sewanya (termasuk tanggal mulai dan selesai, kecuali kebijakan jam sewa menentukan lain).

- Pesanan yang lebih dulu mencapai status **Dikonfirmasi**—umumnya setelah penawaran disetujui dan deposit tervalidasi—mendapat prioritas dan mengunci stok pada seluruh periode sewa.
- Permintaan, draft, atau penawaran yang belum disetujui tidak mengurangi stok secara permanen. Sistem dapat menerapkan *hold* sementara dengan batas waktu yang ditetapkan admin untuk mencegah rebutan saat pembayaran.
- Permintaan baru hanya dapat dikonfirmasi jika kuantitas yang diminta tersedia pada **semua** tanggal sewanya. Kuantitas maksimum yang dapat disewa adalah sisa stok terkecil pada salah satu tanggal dalam rentang tersebut.
- Bila dua pelanggan meminta stok yang sama, urutan prioritas adalah waktu konfirmasi/validasi pembayaran; bila sistem menggunakan *hold*, maka pesanan dengan *hold* aktif lebih dahulu mendapat prioritas hingga *hold* kadaluarsa.
- Pembatalan, penolakan, atau kadaluarsanya *hold* langsung melepaskan kuota sehingga dapat dipakai pesanan lain.

**Contoh:** stok speaker adalah 30 unit. Pesanan A yang sudah dikonfirmasi untuk tanggal 1–2 memakai 20 unit, maka sisa pada tanggal 1 dan 2 adalah 10 unit; pesanan baru lebih dari 10 unit pada tanggal tersebut ditolak. Pesanan B yang telah dikonfirmasi untuk tanggal 8–9 memakai 15 unit. Jika kemudian ada pesanan C untuk tanggal 7–8, stok sisa pada tanggal 7 adalah 30 tetapi pada tanggal 8 hanya 15, sehingga pesanan C hanya dapat dikonfirmasi maksimal 15 unit.

### Satuan sewa, paket, dan proses serah-terima aset

Produk mempunyai dua lapisan satuan:

- **Satuan sewa:** yang dipilih dan dibayar pelanggan, misalnya pcs, paket, atau meter persegi.
- **Satuan pemenuhan:** unit fisik/aset yang dikeluarkan gudang dan harus dipindai QR, misalnya panel LED, speaker, kabel, atau flight case.

Admin menentukan aturan konversi. Contoh: pelanggan menyewa LED seluas **1 meter** dan konfigurasi produk menyatakan 1 meter membutuhkan **4 pcs panel LED**. Sistem otomatis membuat kebutuhan 4 aset panel LED di *pick list*. Bila pelanggan A menyewa 4 meter, sistem membutuhkan 16 pcs; pelanggan B menyewa 8 meter, sistem membutuhkan 32 pcs. Ketersediaan dan alokasi dihitung pada satuan pemenuhan agar aset fisik yang sama tidak terpakai di dua pesanan.

Alur gudang:

1. Pesanan terkonfirmasi menghasilkan *pick list* berisi jumlah kebutuhan dan aset yang harus disiapkan.
2. Staf gudang memilih/memindai aset satu per satu; sistem menyimpan kode barang dan kondisi awal pada pesanan.
3. Saat serah-terima atau sebelum dimuat ke kendaraan, staf/petugas scan ulang seluruh aset. Sistem membandingkan hasil scan dengan *pick list*.
4. Bila scan sesuai, petugas gudang keluar dan PIC penerima mengesahkan serah-terima; aset berubah menjadi `Keluar gudang`. Bila tidak sesuai, sistem menahan proses dan mencatat selisih.
5. Saat selesai acara, PIC lapangan dapat melakukan scan pra-pengembalian. Saat barang tiba, staf gudang scan seluruh aset, mencatat kondisi kembali, dan menyelesaikan atau membuat laporan selisih/kerusakan.

Untuk setiap tahap serah-terima sistem membuat nomor dokumen unik dan versi yang tidak dapat diubah setelah ditandatangani. Koreksi dilakukan lewat dokumen revisi/berita acara tambahan agar jejak audit tetap utuh.

### Pelaporan kerusakan dan penggantian di lapangan

1. PIC lapangan menemukan aset rusak atau tidak berfungsi, lalu memindai QR aset dari aplikasi.
2. PIC memilih jenis/tingkat kerusakan, menulis deskripsi dan dampak terhadap acara, serta mengunggah foto bukti. Jumlah foto yang diwajibkan adalah minimal 1 dan maksimal 5; sistem menampilkan jumlah foto yang sudah dilampirkan.
3. Sistem membuat tiket insiden, mengubah aset menjadi `Bermasalah di lapangan`, menyimpan lokasi/waktu/PIC pelapor, dan mengirim notifikasi kepada admin/koordinator.
4. Admin memeriksa bukti dan menentukan tindakan: panduan perbaikan, kunjungan teknisi, menolak dengan alasan, atau menyetujui penggantian.
5. Jika penggantian disetujui, sistem membuat tugas penggantian serta *pick list* aset pengganti. Staf gudang memilih dan memindai QR aset pengganti; sistem memastikan aset tersedia dan tidak sama dengan aset rusak.
6. Sebelum pengiriman, scan verifikasi ulang dilakukan. PIC lapangan memindai saat menerima aset pengganti. Sistem menautkan aset lama dan aset pengganti pada satu tiket insiden serta memperbarui daftar aset aktif pada pesanan.

### PIC dan tanggung jawab operasional

Setiap pesanan menyimpan PIC berikut. Satu orang dapat memegang lebih dari satu peran bila diberi kewenangan.

| Peran PIC | Tanggung jawab | Sumber PIC |
| --- | --- | --- |
| PIC penyewa | Kontak utama pelanggan untuk konfirmasi, akses lokasi, dan penerimaan layanan. | Pihak penyewa/pelanggan. |
| PIC gudang keluar | Memverifikasi dan menyerahkan barang saat keluar gudang. | Pengguna internal gudang. |
| PIC gudang kembali | Memeriksa dan menerima barang saat kembali ke gudang. | Pengguna internal gudang. |
| PIC lapangan | Bertanggung jawab atas serah-terima, pengantaran, kondisi barang, dan koordinasi selama barang berada di lapangan. | Internal pemilik, pihak penyewa, atau pihak ketiga yang disetujui gudang. |

Jika PIC lapangan bukan pengguna internal, admin wajib memasukkan nama, nomor telepon, organisasi/relasi, dan bukti/otorisasi persetujuan gudang. Sistem menandai asal PIC sebagai `Pemilik`, `Penyewa`, atau `Pihak ketiga tepercaya` dan menyimpan jejak siapa yang menyetujui penunjukan tersebut.

## 8. Kebutuhan Fungsional Penting

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| FR-01 | Sistem wajib mencegah konfirmasi pesanan bila stok tidak tersedia pada periode sewa. | Must |
| FR-02 | Admin dapat mengubah penawaran tanpa mengubah data permintaan asli. | Must |
| FR-03 | Sistem menghitung harga berdasarkan durasi, kuantitas, layanan, dan biaya lokasi. | Must |
| FR-04 | Setiap perubahan status pesanan tercatat dengan waktu dan pengguna pelaku. | Must |
| FR-05 | Pelanggan dapat mengunduh invoice/penawaran dalam PDF. | Should |
| FR-06 | Teknisi dapat menjalankan checklist dan mengunggah bukti foto dari mobile. | Must |
| FR-07 | Admin dapat menandai alat rusak atau maintenance agar tidak dapat dipesan. | Must |
| FR-08 | Sistem mengirim notifikasi untuk penawaran, pembayaran, dan jadwal. | Should |
| FR-09 | Setiap unit aset yang dilacak dapat memiliki QR unik dan riwayat penyewaan, pergerakan, kondisi, serta servis. | Must |
| FR-10 | Sistem mencatat pihak yang mengeluarkan dan menerima aset, beserta waktu, pesanan, kondisi, dan bukti foto. | Must |
| FR-11 | Sistem menghitung ketersediaan stok per tanggal dan hanya mengonfirmasi pesanan jika kuantitas tersedia di seluruh periode sewa. | Must |
| FR-12 | Sistem menerapkan prioritas berdasarkan pesanan terkonfirmasi atau hold aktif paling awal serta melepaskan kuota saat pesanan batal/kadaluarsa. | Must |
| FR-13 | Data penyewa dan minimal satu PIC penyewa wajib tersedia sebelum permintaan sewa diajukan. | Must |
| FR-14 | Sistem menyediakan dashboard pengeluaran/pengembalian barang per tanggal beserta rincian pesanan dan kuantitasnya. | Must |
| FR-15 | Sistem mencatat PIC penyewa, gudang keluar, gudang kembali, dan PIC lapangan beserta asal/otorisasinya. | Must |
| FR-16 | Sistem mendukung harga per pcs dan per paket/satuan ukuran serta mengonversinya menjadi kebutuhan aset fisik. | Must |
| FR-17 | Pesanan terkonfirmasi menghasilkan pick list dengan kode aset spesifik yang dipilih staf gudang. | Must |
| FR-18 | Serah-terima keluar dan pengembalian wajib memverifikasi QR aset terhadap pick list serta mencatat selisih dan kondisi barang. | Must |
| FR-19 | PIC lapangan dapat melaporkan kerusakan dengan scan QR, deskripsi, tingkat urgensi, dan 1–5 foto bukti. | Must |
| FR-20 | Admin dapat meninjau insiden, menyetujui penggantian, dan sistem mewajibkan scan QR aset pengganti saat keluar serta diterima di lapangan. | Must |
| FR-21 | Owner dapat melihat pendapatan sewa diterima, total piutang, tagihan jatuh tempo, dan rincian sisa tagihan per pesanan. | Must |
| FR-22 | Sistem membuat PDF dokumen barang keluar dan barang masuk/pengembalian setelah verifikasi scan, untuk dicetak dan ditandatangani PIC terkait. | Must |
| FR-23 | Sistem menyimpan nama/role PIC penandatangan serta berkas atau bukti tanda tangan pada dokumen serah-terima. | Must |
| FR-24 | Owner/admin dapat mencatat penerimaan stok dari berbagai sumber dan sistem memperbarui stok/aset beserta riwayat asalnya. | Must |

## 9. Data Inti

- **User:** identitas, kontak, peran, alamat, status verifikasi.
- **Penyewa/organisasi:** nama individu/perusahaan, alamat, kontak, dokumen identitas/NPWP bila diperlukan, dan status verifikasi.
- **PIC pesanan:** pesanan, peran PIC, nama, nomor telepon, organisasi, sumber PIC (pemilik/penyewa/pihak ketiga), status persetujuan, penyetuju, dan waktu persetujuan.
- **Produk/Paket:** kategori, nama, foto, spesifikasi, harga, deposit, unit, stok, dan aturan sewa minimum.
- **Penerimaan stok/aset:** nomor penerimaan, sumber (`Pembelian`, `Transfer`, `Hibah`, `Titipan`, `Produksi`, `Lainnya`), pemasok/pengirim, tanggal, dokumen referensi, produk, jumlah, biaya perolehan opsional, penerima, dan catatan.
- **Aturan paket/konversi:** produk sewa, satuan sewa, satuan pemenuhan, rasio konversi, harga per satuan, serta komponen/aset yang diperlukan.
- **Inventaris:** kode aset, produk, kondisi, status, riwayat maintenance.
- **Aset/unit barang:** ID aset, QR token, produk, serial number, tanggal dan harga pembelian, pemasok, kondisi, status, lokasi terakhir, dan umur aset.
- **Log pergerakan aset:** aset, jenis pergerakan (keluar/transfer/tiba/kembali), pesanan/tugas, waktu, lokasi, petugas, PIC pelanggan, kondisi, foto, dan catatan.
- **Pick list dan hasil scan:** pesanan, kebutuhan aset, aset terpilih, status persiapan, hasil scan keluar/kembali, selisih, kondisi, pelaksana, dan waktu.
- **Dokumen serah-terima:** nomor dokumen, jenis (keluar/masuk), pesanan, daftar aset dan kondisi, hasil scan/selisih, lokasi/waktu, PIC penandatangan, PDF, status tanda tangan, versi, dan berita acara koreksi bila ada.
- **Tiket servis:** aset, keluhan, kondisi sebelum/sesudah, teknisi/vendor, biaya, tanggal, tindakan perbaikan, status, dan dokumentasi.
- **Tiket insiden lapangan:** aset rusak, pesanan/tugas, pelapor, lokasi, waktu, jenis/urgensi, deskripsi, 1–5 foto, status review, keputusan admin, aset pengganti, dan jejak serah-terima pengganti.
- **Pesanan:** pelanggan, periode, lokasi, item, biaya, status, catatan, dan dokumen.
- **Alokasi stok:** pesanan, produk/aset, tanggal pemakaian, kuantitas dialokasikan, status alokasi, waktu hold/konfirmasi/kadaluarsa.
- **Penawaran/Invoice:** nomor dokumen, versi, detail biaya, pajak/diskon, jatuh tempo, serta status persetujuan/pembayaran.
- **Tugas lapangan:** pesanan, personel, jadwal, checklist, bukti foto, dan kendala.
- **Pembayaran:** metode, nominal, referensi gateway, status, dan bukti.
- **Piutang/tagihan:** invoice/pesanan, total tagihan, pembayaran teralokasi, sisa tagihan, jatuh tempo, status (`Belum dibayar`, `Sebagian`, `Lunas`, `Terlambat`), dan riwayat pengingat.

## 10. Kebutuhan Nonfungsional

- Tampilan responsif web untuk desktop dan mobile browser.
- Footer aplikasi web mencantumkan identitas pembuat: `Sistem ini dibuat oleh PT Trijaya Digital Koneksindo.`
- Bahasa utama Indonesia; struktur harus memungkinkan penambahan bahasa lain.
- Performa halaman katalog target LCP kurang dari 2,5 detik pada koneksi 4G yang wajar.
- Keamanan: HTTPS, password di-hash, otorisasi berbasis peran, validasi input, dan audit log aktivitas admin.
- QR tidak memuat data sensitif secara langsung; QR hanya memuat token atau URL aman yang divalidasi server.
- Harga beli dan pemasok dibatasi untuk admin berwenang; teknisi hanya melihat data operasional aset.
- Privasi: hanya peran terkait yang dapat mengakses data kontak pelanggan dan detail pesanan.
- Keandalan: backup database harian dan pemulihan data yang terdokumentasi.
- Perhitungan pendapatan menggunakan pembayaran yang benar-benar diterima; nilai sewa pada pesanan belum lunas ditampilkan terpisah sebagai piutang, bukan pendapatan diterima.
- Aksesibilitas dasar: kontras, label form, dan navigasi keyboard pada web.

## 11. Rekomendasi Teknis Awal

- **Web:** React.js + TypeScript (JavaScript bertipe), React Router, TanStack Query, Axios untuk komunikasi API, Tailwind CSS, dan DaisyUI.
- **Mobile:** React Native + TypeScript (JavaScript bertipe), Axios, serta library komponen khusus React Native yang dipilih kemudian; satu aplikasi dengan navigasi/akses berbasis peran.
- **Backend API:** Node.js dengan JavaScript/TypeScript, menggunakan REST API, autentikasi JWT/refresh token, dan RBAC. Framework yang direkomendasikan: Express.js atau NestJS.
- **Database:** PostgreSQL untuk transaksi, inventaris, dan penjadwalan.
- **Media:** object storage untuk foto produk, invoice, dan dokumentasi tugas.
- **Notifikasi:** push notification mobile, email, dan integrasi WhatsApp sebagai kanal tambahan.

Keputusan gateway pembayaran, penyedia peta, dan layanan WhatsApp perlu dipilih berdasarkan negara operasional, biaya, serta kebutuhan legal bisnis.

### Standar implementasi antarmuka

- Seluruh UI **web** wajib menggunakan komponen dan utility class DaisyUI/Tailwind. Tidak membuat stylesheet CSS kustom atau komponen visual dari elemen HTML mentah bila DaisyUI sudah menyediakan komponen yang sesuai.
- Gunakan komponen DaisyUI untuk tombol, form, modal, tabel, badge status, alert, card, drawer, navbar, pagination, dan tema.
- JSX/HTML semantik tetap dipakai sebagai struktur yang dibutuhkan oleh React, tetapi tampilan dan interaksi harus dibangun dari pola/komponen DaisyUI; tidak memakai styling bawaan browser.
- DaisyUI tidak kompatibel langsung dengan React Native. Standar “semua memakai DaisyUI” berlaku untuk web; mobile wajib memakai komponen native dengan design token, warna, spacing, status badge, dan pola UX yang sama agar tampilannya konsisten.
- Semua request frontend ke backend menggunakan Axios melalui satu API client terpusat, termasuk interceptor autentikasi, refresh token, dan penanganan error standar.

## 12. Halaman/Screen Minimum

**Web pelanggan:** Beranda, katalog, detail produk/paket, keranjang, checkout/permintaan sewa, pesanan saya, detail pesanan, profil, login/registrasi.  
**Web owner/admin:** Dashboard kesehatan aset, dashboard pengeluaran per tanggal, pesanan, detail pesanan/penawaran, kalender, produk/paket, inventaris, pelanggan, tugas lapangan, promo, laporan, pengaturan.  
**Mobile pelanggan:** Beranda, katalog, detail, keranjang, checkout, pesanan, detail pesanan, profil.  
**Mobile teknisi:** Tugas, detail tugas, checklist, unggah bukti, riwayat tugas, profil.
**Web admin tambahan:** Daftar aset, detail aset, cetak QR, log pergerakan, tiket servis, dan laporan usia/pemakaian aset.  
**Mobile gudang/teknisi tambahan:** Pemindai QR, pick list, detail aset operasional, verifikasi serah-terima keluar/kembali, serta buat/perbarui tiket servis.
**Mobile PIC lapangan:** Pemindai QR, laporan insiden/kerusakan dengan maksimal lima foto, status tiket, dan konfirmasi penerimaan aset pengganti.
**Dokumen:** Cetak/unduh PDF untuk penawaran, invoice, pick list, surat jalan, dan berita acara serah-terima keluar maupun pengembalian.

## 13. Risiko dan Keputusan Terbuka

- Aturan harga, deposit, pembatalan, keterlambatan, dan kerusakan alat harus ditetapkan sebagai kebijakan bisnis tertulis.
- Ketersediaan perlu memperhitungkan waktu persiapan, perjalanan, pemasangan, dan pembongkaran; bukan hanya waktu acara.
- Perlu diputuskan durasi hold pembayaran (contoh: 30–60 menit) dan apakah hari pemasangan/pembongkaran ikut mengurangi kuota harian.
- Produk videotron mungkin memerlukan konfigurasi ukuran/rasio yang kompleks; MVP sebaiknya memakai paket/varian terstandar terlebih dahulu.
- Pengelolaan stok harus menentukan apakah dihitung per unit aset atau per jumlah unit produk.
- Perlu menetapkan aset mana yang wajib dilacak per unit dan mana yang cukup dicatat per kuantitas.
- Perlu menetapkan sumber penerimaan yang digunakan bisnis serta aturan wajib/tidaknya harga perolehan dan dokumen bukti untuk tiap sumber.
- Perlu mendefinisikan komposisi setiap paket/satuan ukuran agar konversi dari pesanan ke aset fisik selalu akurat.
- SOP pemindaian keluar dan kembali perlu diwajibkan agar riwayat akurat, termasuk aturan siapa yang berwenang mengoreksi log.
- Perlu menetapkan SLA respons insiden dan otorisasi admin untuk penggantian agar barang kritis dapat segera ditangani.
- Perlu menentukan data/dokumen yang wajib untuk memverifikasi penyewa dan SOP persetujuan PIC pihak ketiga.
- Perlu menentukan cakupan area layanan dan formula biaya kirim sebelum checkout final.

## 14. Tahapan Rilis

**Fase 1 — MVP:** katalog, permintaan sewa, penawaran admin, ketersediaan, pesanan, pembayaran deposit, jadwal, checklist teknisi, serta QR aset untuk pencatatan keluar/kembali dan riwayat servis.  
**Fase 2:** promo, invoice PDF, notifikasi lengkap, laporan aset dan bisnis lebih rinci, serta integrasi WhatsApp.  
**Fase 3:** multi-cabang, multi-vendor, optimasi rute, loyalty, dan analitik lanjutan.

## 15. Kriteria Penerimaan MVP

- Pelanggan dapat membuat permintaan sewa dari katalog sampai detail lokasi dan jadwal tersimpan.
- Admin dapat menerbitkan penawaran dan pelanggan dapat menyetujui serta membayar deposit.
- Item dengan stok tidak cukup atau berstatus maintenance tidak dapat dikonfirmasi pada waktu yang sama.
- Sistem menolak kuantitas yang melebihi sisa stok pada salah satu tanggal sewa dan menjelaskan tanggal pembatas serta kuantitas maksimum yang tersedia.
- Admin dapat membuat serta menugaskan pekerjaan lapangan untuk pesanan yang sudah dikonfirmasi.
- Dashboard menampilkan pengeluaran dan pengembalian aset berdasarkan tanggal; admin dapat membuka daftar barang dan PIC dari tanggal tersebut.
- Teknisi dapat menyelesaikan checklist dan mengunggah bukti dari aplikasi mobile.
- Semua pihak hanya melihat data dan tindakan sesuai perannya.
- Pemindaian QR saat aset keluar dan kembali menghasilkan log berisi petugas, waktu, pesanan, lokasi, dan kondisi aset.
- Admin dapat melihat jumlah penyewaan, kondisi terakhir, riwayat perpindahan, dan jumlah/riwayat servis sebuah aset.
- Owner dapat melihat ringkasan aset berdasarkan status/kondisi dan membuka detail aset untuk melihat lokasi, PIC, pemakaian, insiden, serta riwayat servisnya.
- Owner dapat melihat pendapatan sewa yang telah diterima dan daftar uang sewa belum dibayar beserta nominal serta jatuh temponya.
- Owner/admin dapat membuat penerimaan stok dan sistem mencatat sumber barang serta menambah stok yang tersedia; aset yang dilacak per unit memperoleh kode/QR unik.
- Pesanan dengan satuan paket/ukuran secara otomatis menghasilkan kebutuhan pcs/aset berdasarkan rasio konversi yang dikonfigurasi admin.
- Barang tidak dapat ditandai keluar atau selesai kembali sebelum hasil scan sesuai dengan pick list atau selisihnya dicatat dan disetujui petugas berwenang.
- PIC lapangan dapat membuat laporan aset rusak dengan 1–5 foto; admin dapat menyetujui aset pengganti yang dipindai saat keluar gudang dan diterima di lapangan.
- Setelah barang keluar atau kembali tervalidasi, dokumen PDF serah-terima dapat dicetak dan memuat pihak/PIC yang wajib menandatangani.
