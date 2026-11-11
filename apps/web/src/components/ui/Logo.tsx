import logoUrl from '@/assets/brand/eventra-logo.svg';
import iconUrl from '@/assets/brand/eventra-icon.svg';

/**
 * Logo penuh tanpa kotak. Light mode: warna asli. Dark mode: wordmark navy tidak terbaca di latar
 * gelap, jadi logo diberi inversi terang (invert + hue-rotate mempertahankan rona biru dan detail mark).
 */
export function Logo({ className = 'h-10' }: { className?: string }) {
  return (
    <img
      src={logoUrl}
      alt="Eventra"
      className={`${className} in-data-[theme=eventra-dark]:hue-rotate-180 in-data-[theme=eventra-dark]:invert`}
    />
  );
}

/** Mark kotak saja untuk ruang sempit dan indikator loading. */
export function LogoIcon({ className = 'size-8' }: { className?: string }) {
  return <img src={iconUrl} alt="" aria-hidden="true" className={className} />;
}

/**
 * Hanya mark dari logo penuh (tanpa wordmark dan tanpa kotak latar) untuk sidebar yang diciutkan.
 * `object-cover` + `object-left` memotong gambar ke bagian kiri, yaitu mark.
 */
export function LogoMark({ className = 'size-12' }: { className?: string }) {
  return (
    <img
      src={logoUrl}
      alt=""
      aria-hidden="true"
      className={`${className} object-cover object-left in-data-[theme=eventra-dark]:hue-rotate-180 in-data-[theme=eventra-dark]:invert`}
    />
  );
}
