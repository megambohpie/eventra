import { useState } from 'react';
import {
  mdiAccountGroup,
  mdiCube,
  mdiHome,
  mdiLogout,
  mdiMapMarker,
  mdiPackageDown,
  mdiQrcode,
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
  { to: '/assets', labelKey: 'nav.assets', icon: mdiQrcode, capability: 'asset.read' },
  {
    to: '/receipts',
    labelKey: 'nav.receipts',
    icon: mdiPackageDown,
    capability: 'receipt.read',
  },
  { to: '/master', labelKey: 'nav.master', icon: mdiMapMarker, capability: 'master.read' },
];

/**
 * Layout global tunggal: sidebar (drawer DaisyUI) + navbar + konten via <Outlet />.
 * Desktop: sidebar dapat diciutkan menjadi hanya ikon. Ponsel: sidebar menjadi drawer overlay.
 * Seluruh tampilan ada di styles/layout.css; komponen ini hanya memuat struktur dan logika.
 */
export function Layout() {
  const { t } = useTranslation();
  const { user, can, logout } = useAuth();
  const navigate = useNavigate();
  const { collapsed, toggle } = useSidebar();
  const [mobileOpen, setMobileOpen] = useState(false);

  const items = user ? NAV_ITEMS.filter((item) => !item.capability || can(item.capability)) : [];
  const hasSidebar = items.length > 0;
  const toggleLabel = collapsed ? t('nav.expand') : t('nav.collapse');

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className={`drawer ${hasSidebar ? 'lg:drawer-open' : ''}`.trim()}>
      <input
        id="app-drawer"
        type="checkbox"
        className="drawer-toggle"
        checked={mobileOpen}
        onChange={(e) => setMobileOpen(e.target.checked)}
        aria-label={t('nav.menu')}
      />

      <div className="drawer-content ev-drawer__content">
        <header className="navbar ev-navbar">
          <div className="ev-navbar__start">
            {hasSidebar && (
              <>
                <Button
                  className="ev-btn--mobile-only"
                  variant="ghost"
                  size="sm"
                  icon={mdiMenu}
                  aria-label={t('nav.menu')}
                  onClick={() => setMobileOpen(true)}
                />
                <Button
                  className="ev-btn--desktop-only"
                  variant="ghost"
                  size="sm"
                  icon={collapsed ? mdiMenu : mdiMenuOpen}
                  aria-label={toggleLabel}
                  title={toggleLabel}
                  onClick={toggle}
                />
              </>
            )}
            <NavLink
              to="/"
              aria-label={t('app.name')}
              className={hasSidebar ? 'ev-navbar__logo--with-sidebar' : ''}
            >
              <Logo />
            </NavLink>
          </div>
          <div className="ev-navbar__end">
            <LanguageSwitcher />
            <ThemeToggle />
            {user && (
              <>
                <span className="ev-navbar__user">
                  {user.name} · {t(`roles.${user.role}`)}
                </span>
                <Button variant="ghost" size="sm" icon={mdiLogout} onClick={handleLogout}>
                  <span className="ev-btn__label--wide">{t('auth.logout')}</span>
                </Button>
              </>
            )}
          </div>
        </header>
        <main className="ev-content">
          <Outlet />
        </main>
        <NotificationHost />
        <footer className="footer footer-center ev-footer">
          <p>{FOOTER_TEXT}</p>
        </footer>
      </div>

      {hasSidebar && (
        <div className="drawer-side ev-drawer__side">
          <label htmlFor="app-drawer" aria-label={t('common.close')} className="drawer-overlay" />
          <aside className="ev-sidebar" data-collapsed={collapsed}>
            <div className="ev-sidebar__head">
              <NavLink to="/" aria-label={t('app.name')} onClick={() => setMobileOpen(false)}>
                <span className="ev-sidebar__logo-full">
                  <Logo className="ev-logo--sidebar" />
                </span>
                <LogoMark className="ev-sidebar__logo-mark" />
              </NavLink>
            </div>
            <ul className="menu ev-nav">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    onClick={() => setMobileOpen(false)}
                    aria-label={t(item.labelKey)}
                    data-tip={t(item.labelKey)}
                    className={`ev-nav__link ${collapsed ? 'lg:tooltip lg:tooltip-right' : ''}`.trim()}
                  >
                    <Icon path={item.icon} />
                    <span className="ev-nav__label">{t(item.labelKey)}</span>
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
