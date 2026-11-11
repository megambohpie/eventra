import { mdiHome } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { Icon } from './ui/Icon';
import { Logo } from './ui/Logo';
import { NotificationHost } from './ui/NotificationHost';

export const FOOTER_TEXT = 'Sistem ini dibuat oleh PT Trijaya Digital Koneksindo.';

/** Layout global tunggal: semua halaman dirender lewat <Outlet />. */
export function Layout() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col bg-base-200">
      <div className="navbar bg-base-100 shadow-sm print:hidden">
        <div className="flex-1">
          <NavLink to="/" aria-label={t('app.name')}>
            <Logo />
          </NavLink>
        </div>
        <ul className="menu menu-horizontal px-1">
          <li>
            <NavLink to="/">
              <Icon path={mdiHome} />
              {t('nav.home')}
            </NavLink>
          </li>
        </ul>
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <main className="container mx-auto flex-1 p-4">
        <Outlet />
      </main>
      <NotificationHost />
      <footer className="footer footer-center bg-base-300 p-4 text-base-content print:hidden">
        <p>{FOOTER_TEXT}</p>
      </footer>
    </div>
  );
}
