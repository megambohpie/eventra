import { mdiAlertOctagon } from '@mdi/js';
import { Link } from 'react-router-dom';
import { listIncidents } from '@eventra/api-client';
import { INCIDENT_STATUS_BADGE, INCIDENT_URGENCY_BADGE } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';
import { Card, EmptyState, ErrorState, Loading, Muted, Screen, Strong } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { formatDateTime } from '@/lib/format';
import { INCIDENT_STATUS_LABEL, URGENCY_LABEL } from '@/lib/labels';
import { fieldAccess } from '@/lib/tasks';

export function IncidentsPage() {
  const { user } = useAuth();
  const access = fieldAccess(user?.role ?? 'CUSTOMER');
  const { data, error, loading, reload } = useAsync(
    () => listIncidents(api, { pageSize: 50 }),
    'incidents',
  );

  return (
    <Screen title="Insiden" onRefresh={reload}>
      {access.reportIncident && (
        <Link to="/incidents/new" className="btn btn-error ev-btn--block">
          <Icon path={mdiAlertOctagon} />
          Lapor kerusakan aset
        </Link>
      )}
      {data === null && loading && <Loading />}
      {data === null && error && <ErrorState message={error} onRetry={reload} />}
      {data?.items.length === 0 && <EmptyState message="Belum ada insiden." />}
      {data?.items.map((i) => (
        <Card key={i.id} to={`/incidents/${i.id}`}>
          <Strong>
            {i.number} · {i.assetCode}
          </Strong>
          <div className="ev-badges">
            <Badge variant={INCIDENT_STATUS_BADGE[i.status]}>
              {INCIDENT_STATUS_LABEL[i.status]}
            </Badge>
            <Badge variant={INCIDENT_URGENCY_BADGE[i.urgency]}>{URGENCY_LABEL[i.urgency]}</Badge>
          </div>
          <Muted>
            {i.productName} · {i.orderNumber}
          </Muted>
          <Muted>{formatDateTime(i.reportedAt ?? i.createdAt)}</Muted>
        </Card>
      ))}
    </Screen>
  );
}
