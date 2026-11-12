export interface Toast {
  id: number;
  kind: 'error' | 'success' | 'info';
  message: string;
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Antrian notifikasi global (setara NotificationHost web); dibaca komponen `ToastHost`. */
export const getToasts = (): Toast[] => toasts;

export const subscribeToasts = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function notify(kind: Toast['kind'], message: string): number {
  const id = nextId++;
  // Pesan identik yang masih tampil tidak digandakan (mis. beberapa request gagal bersamaan).
  if (toasts.some((t) => t.kind === kind && t.message === message)) return id;
  toasts = [...toasts.slice(-2), { id, kind, message }];
  emit();
  return id;
}

export const notifyError = (message: string): number => notify('error', message);

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}
