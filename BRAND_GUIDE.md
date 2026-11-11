# Eventra — Logo dan Token Warna

## Logo

Gunakan [eventra-logo-v5.svg](assets/brand/eventra-logo-v5.svg) sebagai logo utama. Mark biru menampilkan panel LED/flight case dan sorot lampu untuk menunjukkan bahwa Eventra adalah rental perlengkapan event. Tagline `EVENT EQUIPMENT RENTAL` dipakai pada versi horizontal lengkap. Versi sebelumnya disimpan sebagai eksplorasi, bukan logo utama.

- Gunakan logo penuh pada navbar, halaman login, proposal, dan dokumen utama.
- Gunakan mark kotak saja pada favicon, ikon aplikasi, dan ruang sempit.
- Jaga ruang kosong minimal setara tinggi huruf `E` di sekeliling logo.
- Jangan mengubah gradien, proporsi, atau warna logo.

### Ikon aplikasi dan loading

Gunakan [eventra-icon.svg](assets/brand/eventra-icon.svg) untuk favicon/tab browser, app icon sementara, avatar sistem, dan indikator loading. Ikon ini adalah mark panel LED tanpa wordmark sehingga tetap terbaca pada ukuran kecil.

Contoh penggunaan pada web:

```html
<link rel="icon" type="image/svg+xml" href="/assets/brand/eventra-icon.svg">
```

Untuk loading, tampilkan ikon dengan ukuran 32–48 px dan animasi rotasi/pulse ringan; jangan mengubah bentuk atau warna mark.

## Token warna

| Token | Hex | Pemakaian |
| --- | --- | --- |
| `brand-primary` | `#2563EB` | CTA utama, navigasi aktif, tautan. |
| `brand-primary-content` | `#FFFFFF` | Teks di atas primary. |
| `brand-secondary` | `#0EA5E9` | Aksen, visual data, status informasi. |
| `brand-accent` | `#5EEAD4` | Highlight positif/validasi pada brand. |
| `brand-neutral` | `#123B6D` | Header, teks kuat, sidebar. |
| `base-100` | `#FFFFFF` | Surface utama. |
| `base-200` | `#F5F7FA` | Background aplikasi. |
| `base-300` | `#D9E2EC` | Border/divider. |
| `base-content` | `#1F2933` | Teks utama. |
| `info` | `#0284C7` | Informasi/proses. |
| `success` | `#16A34A` | Tersedia, lunas, scan sesuai. |
| `warning` | `#D97706` | Menunggu, perlu perhatian. |
| `error` | `#DC2626` | Rusak, terlambat, gagal. |

## Tema light dan dark

- **Light mode:** gunakan [eventra-logo-v5.svg](assets/brand/eventra-logo-v5.svg), background terang, dan primary `#2563EB`.
- **Dark mode:** tetap gunakan [eventra-logo-v5.svg](assets/brand/eventra-logo-v5.svg) tanpa mengubah warna logo. Tempatkan logo pada surface terang (`base-100` atau panel putih/biru sangat muda) agar wordmark tetap terbaca.
- Ikon [eventra-icon.svg](assets/brand/eventra-icon.svg) dipakai pada kedua tema.
- Yang berubah antar tema hanyalah token UI di [eventra-theme.css](assets/brand/eventra-theme.css): background, surface, teks, border, dan warna state. Jangan menulis hex warna brand langsung di komponen.

## DaisyUI/Tailwind

```css
@plugin "daisyui/theme" {
  name: "eventra";
  default: true;
  --color-primary: #2563EB;
  --color-primary-content: #FFFFFF;
  --color-secondary: #0EA5E9;
  --color-accent: #5EEAD4;
  --color-neutral: #123B6D;
  --color-base-100: #FFFFFF;
  --color-base-200: #F5F7FA;
  --color-base-300: #D9E2EC;
  --color-base-content: #1F2933;
  --color-info: #0284C7;
  --color-success: #16A34A;
  --color-warning: #D97706;
  --color-error: #DC2626;
}
```

## Status operasional

| Status | DaisyUI class |
| --- | --- |
| Tersedia / selesai / lunas | `badge-success` |
| Reservasi / dalam proses / informasi | `badge-info` |
| Menunggu / perlu perhatian | `badge-warning` |
| Rusak / terlambat / dibatalkan | `badge-error` |
| Pensiun / nonaktif | `badge-neutral` |
