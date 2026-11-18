import {
  mdiAccountCircle,
  mdiAlertOctagon,
  mdiClipboardList,
  mdiHome,
  mdiFileDocumentOutline,
} from '@mdi/js';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { usePortal } from '@/auth/portal';
import { fieldAccess } from '@/lib/tasks';
import { ConfirmHost, ToastHost } from './Feedback';
import { Icon } from './Icon';

/** Satu-satunya layout: konten halaman + tab bawah (gaya aplikasi ponsel). */
export function Layout() {
  const { user } = useAuth();
  const portal = usePortal();
  const access = user ? fieldAccess(user.role) : null;
  const tabs =
    portal && !user
      ? [
          { to: '/p', label: 'Pesanan', icon: mdiFileDocumentOutline, show: true, end: true },
          { to: '/p/report', label: 'Lapor', icon: mdiAlertOctagon, show: true, end: false },
        ]
      : [
          { to: '/', label: 'Beranda', icon: mdiHome, show: user !== null, end: true },
          {
            to: '/tasks',
            label: 'Tugas',
            icon: mdiClipboardList,
            show: access?.tasks ?? false,
            end: true,
          },
          {
            to: '/incidents',
            label: 'Insiden',
            icon: mdiAlertOctagon,
            show: access?.incidents ?? false,
          },
          { to: '/account', label: 'Akun', icon: mdiAccountCircle, show: user !== null },
        ].filter((t) => t.show);

  return (
    <div className="ev-app">
      <main className="ev-main">
        <Outlet />
      </main>
      {tabs.length > 0 && (
        <nav className="dock ev-dock" aria-label="Menu utama">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className="ev-dock__item">
              <Icon path={t.icon} />
              <span className="dock-label">{t.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
      <ToastHost />
      <ConfirmHost />
    </div>
  );
}
