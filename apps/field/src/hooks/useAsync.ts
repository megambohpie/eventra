import { useEffect, useEffectEvent, useState } from 'react';
import { errorMessage } from '@/lib/errors';

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
  /** Ganti data lokal dengan respons mutasi terbaru tanpa memuat ulang. */
  setData: (data: T) => void;
}

interface Settled<T> {
  key: string;
  data: T | null;
  error: string | null;
}

/**
 * Muat data saat mount dan setiap `key` berubah atau `reload()` dipanggil. Data lama tetap tampil
 * selama muat ulang; hasil permintaan yang sudah usang diabaikan.
 */
export function useAsync<T>(load: () => Promise<T>, key: string | number): AsyncState<T> {
  const [version, setVersion] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const run = useEffectEvent(load);
  const requestKey = `${key}#${version}`;

  useEffect(() => {
    let cancelled = false;
    run().then(
      (data) => {
        if (!cancelled) setSettled({ key: requestKey, data, error: null });
      },
      (e: unknown) => {
        if (!cancelled)
          setSettled((prev) => ({
            key: requestKey,
            data: prev?.data ?? null,
            error: errorMessage(e),
          }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  return {
    data: settled?.data ?? null,
    error: settled?.error ?? null,
    loading: settled?.key !== requestKey,
    reload: () => setVersion((v) => v + 1),
    setData: (data) => setSettled({ key: requestKey, data, error: null }),
  };
}
