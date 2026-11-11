// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import type { Role } from '@eventra/shared';
import { App } from '@/App';
import '@/i18n';
import { i18n } from '@/i18n';
import { clearSession, setSession } from '@/lib/session';
import { AuthProvider } from './AuthProvider';

/** Render sungguhan ke DOM agar redirect <Navigate> (berbasis efek) ikut berjalan. */
async function renderAt(path: string): Promise<string> {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );
  });
  const html = container.innerHTML;
  await act(async () => root.unmount());
  return html;
}

function signInAs(role: Role): void {
  setSession({
    accessToken: 'token',
    refreshToken: 'refresh',
    user: { id: 'u1', name: 'Tester', email: 't@test.local', phone: null, role, active: true },
  });
}

describe('route guard', () => {
  afterEach(() => clearSession());

  it('pengunjung anonim diarahkan ke halaman login', async () => {
    const html = await renderAt('/customers');
    expect(html).toContain(i18n.t('auth.loginTitle'));
    expect(html).not.toContain(i18n.t('customers.title'));
  });

  it('role tanpa capability melihat halaman terlarang, bukan halaman pelanggan', async () => {
    signInAs('WAREHOUSE');
    const html = await renderAt('/customers');
    expect(html).toContain(i18n.t('errors.FORBIDDEN'));
    expect(html).not.toContain(i18n.t('customers.new'));
  });

  it('menu navigasi hanya menampilkan item yang diizinkan role', async () => {
    signInAs('WAREHOUSE');
    const html = await renderAt('/products');
    expect(html).toContain(i18n.t('nav.products'));
    expect(html).not.toContain(i18n.t('nav.customers'));
  });
});
