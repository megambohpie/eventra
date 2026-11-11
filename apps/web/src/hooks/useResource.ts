import { useEffect, useEffectEvent, useState } from 'react';

interface Settled<T> {
  key: string;
  data: T | undefined;
}

/**
 * Memuat data dari API setiap `key` berubah atau `reload()` dipanggil.
 * Error sudah dinotifikasi oleh client Axios; di sini hanya menghasilkan `data` kosong.
 */
export function useResource<T>(fetcher: () => Promise<T>, key: string) {
  const [version, setVersion] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const run = useEffectEvent(fetcher);
  const requestKey = `${key}#${version}`;

  useEffect(() => {
    let cancelled = false;
    run().then(
      (data) => {
        if (!cancelled) setSettled({ key: requestKey, data });
      },
      () => {
        if (!cancelled) setSettled({ key: requestKey, data: undefined });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  return {
    data: settled?.data,
    loading: settled?.key !== requestKey,
    reload: () => setVersion((v) => v + 1),
  };
}
