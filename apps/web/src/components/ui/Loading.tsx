import { useTranslation } from 'react-i18next';
import { LogoIcon } from './Logo';

/** Indikator loading tingkat halaman/section: ikon Eventra dengan pulse ringan. */
export function Loading() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t('common.loading')} className="flex justify-center p-4">
      <LogoIcon className="size-10 animate-pulse" />
    </div>
  );
}
