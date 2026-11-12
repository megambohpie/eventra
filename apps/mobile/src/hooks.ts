import { useEffect, useEffectEvent, useState, useSyncExternalStore } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { sessionStore } from './api';
import { getToasts, subscribeToasts } from './lib/toast';
import { errorMessage } from './lib/errors';

export const useSession = () =>
  useSyncExternalStore(sessionStore.subscribe, sessionStore.get, sessionStore.get);

export const useToasts = () => useSyncExternalStore(subscribeToasts, getToasts, getToasts);

/** true bila perangkat punya koneksi; aksi tulis dinonaktifkan saat offline (scan harus tervalidasi server). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        setOnline(state.isConnected !== false && state.isInternetReachable !== false);
      }),
    [],
  );
  return online;
}

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
 * selama muat ulang (pull to refresh); hasil permintaan yang sudah usang diabaikan.
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
        // Data lama (bila ada) tetap ditampilkan bersama pesan galat.
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
