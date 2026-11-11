import { mdiMagnify } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchInput({ value, onChange }: SearchInputProps) {
  const { t } = useTranslation();
  return (
    <label className="input w-full rounded-full sm:w-64">
      <Icon path={mdiMagnify} className="opacity-60" />
      <input
        type="search"
        placeholder={t('common.search')}
        aria-label={t('common.search')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
