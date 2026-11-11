export type NotificationType = 'error' | 'success' | 'warning' | 'info';

export interface AppNotification {
  id: number;
  type: NotificationType;
  message: string;
}

const MAX_VISIBLE = 5;
let items: AppNotification[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

/** Store notifikasi global; dapat dipanggil dari kode non-React (mis. interceptor Axios). */
export function notify(type: NotificationType, message: string, durationMs?: number): number {
  const id = nextId++;
  items = [...items, { id, type, message }].slice(-MAX_VISIBLE);
  emit();
  const timeout = durationMs ?? (type === 'error' ? 6000 : 4000);
  if (timeout > 0) setTimeout(() => dismiss(id), timeout);
  return id;
}

export const notifyError = (message: string) => notify('error', message);

export function dismiss(id: number): void {
  items = items.filter((item) => item.id !== id);
  emit();
}

export function clearNotifications(): void {
  items = [];
  emit();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getNotifications(): AppNotification[] {
  return items;
}
