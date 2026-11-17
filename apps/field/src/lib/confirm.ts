export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  resolve: (ok: boolean) => void;
}

let current: ConfirmRequest | null = null;
const listeners = new Set<() => void>();

/** Dialog konfirmasi global (dirender `ConfirmHost`); resolve true bila dikonfirmasi. */
export function confirm(
  title: string,
  message: string,
  confirmLabel = 'Lanjutkan',
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    current = {
      title,
      message,
      confirmLabel,
      resolve: (ok) => {
        current = null;
        listeners.forEach((l) => l());
        resolve(ok);
      },
    };
    listeners.forEach((l) => l());
  });
}

export const getConfirm = (): ConfirmRequest | null => current;
export function subscribeConfirm(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
