import logoUrl from '@/assets/brand/eventra-logo.svg';
import iconUrl from '@/assets/brand/eventra-icon.svg';

/** Logo penuh. Tampilan (ukuran, penyesuaian dark mode) diatur di styles/base.css (`.ev-logo`). */
export function Logo({ className = '' }: { className?: string }) {
  return <img src={logoUrl} alt="Eventra" className={`ev-logo ${className}`.trim()} />;
}

/** Mark kotak saja untuk ruang sempit dan indikator loading. */
export function LogoIcon({ className = '' }: { className?: string }) {
  return (
    <img src={iconUrl} alt="" aria-hidden="true" className={`ev-logo-icon ${className}`.trim()} />
  );
}

/** Hanya mark dari logo penuh (tanpa wordmark/kotak latar), mis. untuk sidebar yang diciutkan. */
export function LogoMark({ className = '' }: { className?: string }) {
  return (
    <img src={logoUrl} alt="" aria-hidden="true" className={`ev-logo-mark ${className}`.trim()} />
  );
}
