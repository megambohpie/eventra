import { useState } from 'react';
import {
  mdiAccountGroup,
  mdiCube,
  mdiHome,
  mdiLogout,
  mdiMapMarker,
  mdiMenu,
  mdiMenuOpen,
} from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { Capability } from '@eventra/shared';
import { useAuth } from '../auth/AuthProvider';
import { useSidebar } from '../hooks/useSidebar';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';
import { Logo, LogoMark } from './ui/Logo';
import { NotificationHost } from './ui/NotificationHost';

export const FOOTER_TEXT = 'Sistem ini dibuat oleh PT Trijaya Digital Koneksindo.';

// Semua menu hanya tampil setelah login; `capability` menyaring lebih lanjut per peran.
const NAV_ITEMS: { to: string; labelKey: string; icon: string; capability?: Capability }[] = [
  { to: '/', labelKey: 'nav.home', icon: mdiHome },
  {
    to: '/customers',
    labelKey: 'nav.customers',
    icon: mdiAccountGroup,
    capability: 'customer.read',
  },
  { to: '/products', labelKey: 'nav.products', icon: mdiCube, capability: 'product.read' },
  { to: '/master', labelKey: 'nav.master', icon: mdiMapMarker, capability: 'master.read' },
];

/**
 * Layout global tunggal: sidebar (drawer DaisyUI) + navbar + konten via <Outlet />.
 * Desktop: sidebar dapat diciutkan menjadi hanya ikon. Ponsel: sidebar menjadi drawer overlay.
 */
export function Layout() {
  const { t } = useTranslation();
  const { user, can, logout } = useAuth();
  const navigate = useNavigate();
  const { collapsed, toggle } = useSidebar();
  const [mobileOpen, setMobileOpen] = useState(false);

  const items = user ? NAV_ITEMS.filter((item) => !item.capability || can(item.capability)) : [];
  const hasSidebar = items.length > 0;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className={`drawer ${hasSidebar ? 'lg:drawer-open' : ''}`}>
      <input
        id="app-drawer"
        type="checkbox"
        className="drawer-toggle"
        checked={mobileOpen}
        onChange={(e) => setMobileOpen(e.target.checked)}
        aria-label={t('nav.menu')}
      />

      <div className="drawer-content flex min-h-screen flex-col bg-linear-to-br from-primary/5 via-base-200 to-secondary/10">
        <header className="navbar sticky top-0 z-30 gap-2 bg-base-100/70 px-3 backdrop-blur-md sm:px-6 print:hidden">
          <div className="flex flex-1 items-center gap-2">
            {hasSidebar && (
              <>
                <Button
                  className="lg:hidden"
                  variant="ghost"
                  size="sm"
                  icon={mdiMenu}
                  aria-label={t('nav.menu')}
                  onClick={() => setMobileOpen(true)}
                />
                <Button
                  className="hidden lg:inline-flex"
                  variant="ghost"
                  size="sm"
                  icon={collapsed ? mdiMenu : mdiMenuOpen}
                  aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
                  title={collapsed ? t('nav.expand') : t('nav.collapse')}
                  onClick={toggle}
                />
              </>
            )}
            {/* Dengan sidebar, logo ada di sidebar pada desktop. */}
            <NavLink to="/" aria-label={t('app.name')} className={hasSidebar ? 'lg:hidden' : ''}>
              <Logo />
            </NavLink>
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
            {user && (
              <>
                <span className="hidden text-sm xl:inline">
                  {user.name} · {t(`roles.${user.role}`)}
                </span>
                <Button variant="ghost" size="sm" icon={mdiLogout} onClick={handleLogout}>
                  <span className="hidden sm:inline">{t('auth.logout')}</span>
                </Button>
              </>
            )}
          </div>
        </header>
        <main className="container mx-auto flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
        <NotificationHost />
        <footer className="footer footer-center p-4 text-sm text-base-content/70 print:hidden">
          <p>{FOOTER_TEXT}</p>
        </footer>
      </div>

      {hasSidebar && (
        <div className="drawer-side z-40 print:hidden">
          <label htmlFor="app-drawer" aria-label={t('common.close')} className="drawer-overlay" />
          <aside
            className={`flex min-h-full w-64 flex-col bg-base-100 shadow-lg shadow-primary/5 transition-[width] duration-200 ${collapsed ? 'lg:w-16' : ''}`}
          >
            <div
              className={`flex h-24 items-center px-3 ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}
            >
              <NavLink to="/" aria-label={t('app.name')} onClick={() => setMobileOpen(false)}>
                <span className={collapsed ? 'lg:hidden' : ''}>
                  <Logo className="h-[4.5rem]" />
                </span>
                {collapsed && <LogoMark className="hidden size-12 lg:block" />}
              </NavLink>
            </div>
            <ul className="menu w-full gap-1 p-3">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    onClick={() => setMobileOpen(false)}
                    aria-label={t(item.labelKey)}
                    data-tip={t(item.labelKey)}
                    className={({ isActive }) =>
                      `gap-3 rounded-2xl py-3 transition-colors ${
                        isActive
                          ? 'bg-primary/15! font-semibold text-primary!'
                          : 'text-base-content/80 hover:bg-base-200'
                      } ${collapsed ? 'lg:tooltip lg:tooltip-right lg:justify-center' : ''}`
                    }
                  >
                    <Icon path={item.icon} size={collapsed ? 1.6 : 1.25} />
                    <span className={collapsed ? 'lg:hidden' : ''}>{t(item.labelKey)}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}
    </div>
  );
}
