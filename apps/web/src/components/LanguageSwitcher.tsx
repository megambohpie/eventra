import { mdiTranslate } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage, type Language } from '../i18n';
import { Icon } from './ui/Icon';

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  return (
    <label className="ev-lang">
      <Icon path={mdiTranslate} />
      <select
        className="select select-ghost select-sm"
        aria-label={t('common.language')}
        value={i18n.language}
        onChange={(e) => setLanguage(e.target.value as Language)}
      >
        {LANGUAGES.map((lang) => (
          <option key={lang} value={lang}>
            {lang.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}
