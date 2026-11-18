import { mdiAlertOctagon } from '@mdi/js';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { Badge } from '@/components/Badge';
import { Card, EmptyState, ErrorState, Loading, Muted, Screen, Strong } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useTasks } from '@/hooks/useTasks';
import { fieldAccess } from '@/lib/tasks';

export function TasksPage() {
  const { user } = useAuth();
  const role = user?.role ?? 'CUSTOMER';
  const access = fieldAccess(role);
  const { data, error, loading, reload } = useTasks(role);

  if (!access.tasks) {
    return (
      <Screen title="Tugas saya">
        <Muted>Peran Anda tidak memiliki akses aplikasi lapangan.</Muted>
      </Screen>
    );
  }

  return (
    <Screen title="Tugas saya" onRefresh={reload}>
      {access.reportIncident && (
        <Link to="/incidents/new" className="btn btn-error ev-btn--block">
          <Icon path={mdiAlertOctagon} />
          Lapor kerusakan aset
        </Link>
      )}
      {data === null && loading && <Loading />}
      {data === null && error && <ErrorState message={error} onRetry={reload} />}
      {data !== null && error && <p className="ev-warn-text">{error} Data mungkin usang.</p>}
      {data?.length === 0 && <EmptyState message="Tidak ada tugas saat ini." />}
      {data?.map((task) => (
        <Card key={task.key} to={task.to}>
          <Strong>{task.title}</Strong>
          <div>
            <Badge variant={task.badge}>{task.status}</Badge>
          </div>
          <Muted>{task.subtitle}</Muted>
        </Card>
      ))}
    </Screen>
  );
}
