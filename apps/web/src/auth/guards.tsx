import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Capability } from '@eventra/shared';
import { Loading } from '@/components/ui/Loading';
import { useAuth } from './AuthProvider';

/** Route guard: wajib login; yang belum login diarahkan ke /login dan kembali setelahnya. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Capability guard untuk rute: tanpa izin tampil halaman terlarang (API juga menolak 403). */
export function RequireCapability({ capability }: { capability: Capability }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  if (!can(capability)) {
    return (
      <div role="alert" className="alert alert-warning">
        <span>{t('errors.FORBIDDEN')}</span>
      </div>
    );
  }
  return <Outlet />;
}
