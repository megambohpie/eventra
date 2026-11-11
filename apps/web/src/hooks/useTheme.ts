import { useCallback, useState } from 'react';

export type ThemeMode = 'light' | 'dark';
const STORAGE_KEY = 'eventra.theme';
const THEME_NAME: Record<ThemeMode, string> = { light: 'eventra-light', dark: 'eventra-dark' };

function initialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* storage tidak tersedia */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(mode: ThemeMode): void {
  document.documentElement.setAttribute('data-theme', THEME_NAME[mode]);
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const initial = initialTheme();
    applyTheme(initial);
    return initial;
  });

  const toggle = useCallback(() => {
    const next: ThemeMode = mode === 'light' ? 'dark' : 'light';
    applyTheme(next);
    setMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* abaikan */
    }
  }, [mode]);

  return { mode, toggle };
}
