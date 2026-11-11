import { useCallback, useState } from 'react';

const STORAGE_KEY = 'eventra.sidebar.collapsed';

function initial(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Status sidebar desktop (ringkas = hanya ikon), diingat antar kunjungan. */
export function useSidebar() {
  const [collapsed, setCollapsed] = useState(initial);

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* abaikan */
      }
      return next;
    });
  }, []);

  return { collapsed, toggle };
}
