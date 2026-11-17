import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { Layout } from './components/Layout';
import { Loading, Muted } from './components/ui';
import { AccountPage } from './pages/AccountPage';
import { DocumentPage } from './pages/DocumentPage';
import { IncidentDetailPage } from './pages/IncidentDetailPage';
import { DeliveryNoteReportPage, IncidentNewPage } from './pages/IncidentNewPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { LoginPage } from './pages/LoginPage';
import { PickListPage } from './pages/PickListPage';
import { ReplacementPage } from './pages/ReplacementPage';
import { TasksPage } from './pages/TasksPage';
import type { Capability } from '@eventra/shared';

/** Wajib login; yang belum login diarahkan ke /login lalu kembali ke halaman semula (mis. hasil scan QR). */
function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

function RequireCapability({ capability }: { capability: Capability }) {
  const { can } = useAuth();
  if (!can(capability)) {
    return <Muted>Anda tidak memiliki izin untuk membuka halaman ini.</Muted>;
  }
  return <Outlet />;
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route index element={<TasksPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route element={<RequireCapability capability="warehouse.read" />}>
            <Route path="pick-lists/:id" element={<PickListPage />} />
            <Route path="replacements/:id" element={<ReplacementPage />} />
            <Route path="documents/:id" element={<DocumentPage />} />
          </Route>
          <Route element={<RequireCapability capability="incident.read" />}>
            <Route path="incidents" element={<IncidentsPage />} />
            <Route path="incidents/:id" element={<IncidentDetailPage />} />
          </Route>
          <Route element={<RequireCapability capability="incident.report" />}>
            <Route path="incidents/new" element={<IncidentNewPage />} />
            <Route path="r/:token" element={<DeliveryNoteReportPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
