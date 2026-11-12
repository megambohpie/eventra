import { useState, type FocusEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

export interface SearchSelectOption {
  value: string;
  label: string;
}

interface SearchSelectProps {
  options: SearchSelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

/** Dropdown dengan pencarian: ketik untuk menyaring; daftar dibatasi tinggi dan bisa di-scroll. */
export function SearchSelect({ options, value, onChange, disabled, ariaLabel }: SearchSelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((o) => o.value === value);
  const needle = query.trim().toLowerCase();
  const filtered = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;

  const close = () => {
    setOpen(false);
    setQuery('');
  };
  const pick = (option: SearchSelectOption) => {
    onChange(option.value);
    close();
  };
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) close();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') close();
    if (event.key === 'Enter' && open) {
      event.preventDefault();
      const first = filtered[0];
      if (first) pick(first);
    }
  };

  return (
    <div className="ev-select" onBlur={handleBlur}>
      <input
        className="input ev-control"
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        autoComplete="off"
        value={open ? query : (selected?.label ?? '')}
        placeholder={open ? (selected?.label ?? t('common.search')) : t('common.search')}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <ul className="menu ev-select__menu" role="listbox" onMouseDown={(e) => e.preventDefault()}>
          {filtered.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={o.value === value ? 'menu-active' : ''}
                onClick={() => pick(o)}
              >
                {o.label}
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="ev-select__empty">{t('common.noResults')}</li>}
        </ul>
      )}
    </div>
  );
}
