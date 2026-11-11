import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearNotifications, dismiss, getNotifications, notify } from './notifications';

describe('notifications', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    clearNotifications();
    vi.useRealTimers();
  });

  it('menambah dan menutup notifikasi', () => {
    const id = notify('error', 'Boom');
    expect(getNotifications()).toMatchObject([{ type: 'error', message: 'Boom' }]);
    dismiss(id);
    expect(getNotifications()).toHaveLength(0);
  });

  it('hilang otomatis setelah durasi', () => {
    notify('error', 'Boom');
    vi.advanceTimersByTime(6001);
    expect(getNotifications()).toHaveLength(0);
  });

  it('membatasi jumlah yang tampil', () => {
    for (let i = 0; i < 8; i++) notify('info', `n${i}`, 0);
    expect(getNotifications()).toHaveLength(5);
    expect(getNotifications()[4]?.message).toBe('n7');
  });
});
