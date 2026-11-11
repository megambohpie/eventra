import { mdiWeatherNight, mdiWhiteBalanceSunny } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../hooks/useTheme';
import { Button } from './ui/Button';

export function ThemeToggle() {
  const { t } = useTranslation();
  const { mode, toggle } = useTheme();
  return (
    <Button
      variant="ghost"
      size="sm"
      icon={mode === 'light' ? mdiWeatherNight : mdiWhiteBalanceSunny}
      onClick={toggle}
      aria-label={t(`common.theme.${mode}`)}
      title={t(`common.theme.${mode}`)}
    />
  );
}
