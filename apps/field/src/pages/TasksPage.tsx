import { mdiAlertOctagon } from '@mdi/js';
import { Link } from 'react-router-dom';
import { listIncidents, listPickLists, listReplacements } from '@eventra/api-client';
import { useAuth } from '@/auth/AuthProvider';
import { Badge } from '@/components/Badge';
import { Card, EmptyState, ErrorState, Loading, Muted, Screen, Strong } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { api } from '@/api';
import { useAsync } from '@/hooks/useAsync';
import { buildTasks, fieldAccess, taskSourcesFor } from '@/lib/tasks';

export function TasksPage() {
  const { user } = useAuth();
  const role = user?.role ?? 'CUSTOMER';
  const access = fieldAccess(role);
  const { data, error, loading, reload } = useAsync(async () => {
    const want = taskSourcesFor(role);
    const [pickLists, replacements, incidents] = await Promise.all([
      want.pickLists ? listPickLists(api, { pageSize: 100 }) : null,
      want.replacements ? listReplacements(api, { pageSize: 100 }) : null,
      want.incidents ? listIncidents(api, { pageSize: 100 }) : null,
    ]);
    return buildTasks(role, {
      pickLists: pickLists?.items,
      replacements: replacements?.items,
      incidents: incidents?.items,
    });
  }, role);

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
