import { StyleSheet, Text, View } from 'react-native';
import { listIncidents } from '@eventra/api-client';
import { INCIDENT_STATUS_BADGE, INCIDENT_URGENCY_BADGE, type Role } from '@eventra/shared';
import { api } from '../api';
import { useAsync } from '../hooks';
import { INCIDENT_STATUS_LABEL, URGENCY_LABEL } from '../lib/labels';
import { mobileAccess } from '../lib/tasks';
import { formatDateTime } from '../lib/format';
import type { Route } from '../lib/navigation';
import { Badge, Button, Card, EmptyState, ErrorState, Loading, Muted, Screen } from '../ui';
import { colors, spacing } from '../theme';

export function IncidentsScreen({ role, onOpen }: { role: Role; onOpen: (route: Route) => void }) {
  const access = mobileAccess(role);
  const { data, error, loading, reload } = useAsync(
    () => listIncidents(api, { pageSize: 50 }),
    'incidents',
  );

  return (
    <Screen title="Insiden" onRefresh={reload} refreshing={loading && data !== null}>
      {access.reportIncident ? (
        <Button variant="error" onPress={() => onOpen({ name: 'incidentNew' })}>
          Lapor kerusakan aset
        </Button>
      ) : null}
      {data === null && loading ? <Loading /> : null}
      {data === null && error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data?.items.length === 0 ? <EmptyState message="Belum ada insiden." /> : null}
      {data?.items.map((i) => (
        <Card key={i.id} onPress={() => onOpen({ name: 'incident', id: i.id })}>
          <Text style={styles.title}>
            {i.number} · {i.assetCode}
          </Text>
          <View style={styles.badges}>
            <Badge variant={INCIDENT_STATUS_BADGE[i.status]}>
              {INCIDENT_STATUS_LABEL[i.status]}
            </Badge>
            <Badge variant={INCIDENT_URGENCY_BADGE[i.urgency]}>{URGENCY_LABEL[i.urgency]}</Badge>
          </View>
          <Muted>
            {i.productName} · {i.orderNumber}
          </Muted>
          <Muted>{formatDateTime(i.reportedAt ?? i.createdAt)}</Muted>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '700', color: colors.baseContent },
  badges: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
});
