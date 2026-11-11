import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';
import { id } from './locales/id';

export const LANGUAGES = ['en', 'id'] as const;
export type Language = (typeof LANGUAGES)[number];
const STORAGE_KEY = 'eventra.lang';

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'id') return saved;
  } catch {
    /* storage tidak tersedia */
  }
  return typeof navigator !== 'undefined' && navigator.language.startsWith('id') ? 'id' : 'en';
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, id: { translation: id } },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: Language): void {
  void i18n.changeLanguage(lang);
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* abaikan */
  }
}

export { i18n };
