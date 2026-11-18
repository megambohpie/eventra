import { mdiAccountCircle, mdiAlertOctagon, mdiClipboardList } from '@mdi/js';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';
import {
  Card,
  EmptyState,
  ErrorState,
  Loading,
  Muted,
  Screen,
  Section,
  Strong,
} from '@/components/ui';
import { useTasks } from '@/hooks/useTasks';
import { fieldAccess } from '@/lib/tasks';

const ROLE_LABEL = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  OPS_COORDINATOR: 'Koordinator operasional',
  WAREHOUSE: 'Gudang',
  FIELD_PIC: 'PIC lapangan',
  CUSTOMER: 'Pelanggan',
} as const;

const PREVIEW_COUNT = 3;

/** Beranda staf: sapaan, ringkasan tugas, pintasan, dan tugas terbaru. */
export function HomePage() {
  const { user } = useAuth();
  const role = user?.role ?? 'CUSTOMER';
  const access = fieldAccess(role);
  const { data, error, loading, reload } = useTasks(role);

  if (!user) return null;

  if (!access.tasks) {
    return (
      <Screen title="Beranda">
        <Muted>Peran Anda tidak memiliki akses aplikasi lapangan.</Muted>
      </Screen>
    );
  }

  return (
    <Screen title="Beranda" onRefresh={reload}>
      <Card>
        <Muted>Selamat datang,</Muted>
        <Strong>{user.name}</Strong>
        <div className="ev-badges">
          <Badge variant="neutral">{ROLE_LABEL[role]}</Badge>
        </div>
      </Card>

      <div className="ev-stats">
        <Link to="/tasks" className="ev-stat">
          <span className="ev-stat__value">{data ? data.length : '–'}</span>
          <span className="ev-stat__label">Tugas aktif</span>
        </Link>
      </div>

      <Section title="Pintasan">
        <div className="ev-shortcuts">
          <Link to="/tasks" className="ev-shortcut">
            <Icon path={mdiClipboardList} />
            Tugas
          </Link>
          {access.incidents && (
            <Link to="/incidents" className="ev-shortcut">
              <Icon path={mdiAlertOctagon} />
              Insiden
            </Link>
          )}
          {access.reportIncident && (
            <Link to="/incidents/new" className="ev-shortcut ev-shortcut--danger">
              <Icon path={mdiAlertOctagon} />
              Lapor kerusakan
            </Link>
          )}
          <Link to="/account" className="ev-shortcut">
            <Icon path={mdiAccountCircle} />
            Akun
          </Link>
        </div>
      </Section>

      <Section title="Tugas terbaru">
        {data === null && loading && <Loading />}
        {data === null && error && <ErrorState message={error} onRetry={reload} />}
        {data?.length === 0 && <EmptyState message="Tidak ada tugas saat ini." />}
        {data?.slice(0, PREVIEW_COUNT).map((task) => (
          <Card key={task.key} to={task.to}>
            <Strong>{task.title}</Strong>
            <div>
              <Badge variant={task.badge}>{task.status}</Badge>
            </div>
            <Muted>{task.subtitle}</Muted>
          </Card>
        ))}
        {data !== null && data.length > PREVIEW_COUNT && (
          <Link to="/tasks" className="btn btn-outline ev-btn--block">
            Lihat semua tugas ({data.length})
          </Link>
        )}
      </Section>
    </Screen>
  );
}
