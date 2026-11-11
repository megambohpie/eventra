import logoUrl from '../../../../../assets/brand/eventra-logo-v5.svg';
import iconUrl from '../../../../../assets/brand/eventra-icon.svg';

/**
 * Logo penuh. Warna logo tidak boleh diubah; teksnya gelap, jadi selalu diletakkan
 * di panel terang agar tetap terbaca pada dark mode (BRAND_GUIDE.md).
 */
export function Logo({ className = 'h-9' }: { className?: string }) {
  return (
    <span className="inline-flex items-center rounded-box bg-white px-2 py-1">
      <img src={logoUrl} alt="Eventra" className={className} />
    </span>
  );
}

/** Mark kotak saja untuk ruang sempit dan indikator loading. */
export function LogoIcon({ className = 'size-8' }: { className?: string }) {
  return <img src={iconUrl} alt="" aria-hidden="true" className={className} />;
}
