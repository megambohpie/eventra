import { afterEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../i18n';
import { clearNotifications, notify } from '../../lib/notifications';
import { NotificationHost } from './NotificationHost';

describe('NotificationHost', () => {
  afterEach(clearNotifications);

  it('menampilkan error sebagai alert DaisyUI di dalam toast', () => {
    notify('error', 'Cannot reach the server', 0);
    const html = renderToStaticMarkup(<NotificationHost />);
    expect(html).toContain('toast');
    expect(html).toContain('alert alert-error');
    expect(html).toContain('Cannot reach the server');
    expect(html).toContain('role="alert"');
  });

  it('tidak merender apa pun bila kosong', () => {
    expect(renderToStaticMarkup(<NotificationHost />)).toBe('');
  });
});
