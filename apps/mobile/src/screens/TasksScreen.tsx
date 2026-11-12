import { StyleSheet, Text, View } from 'react-native';
import { listIncidents, listPickLists, listReplacements } from '@eventra/api-client';
import type { Role } from '@eventra/shared';
import { api } from '../api';
import { useAsync } from '../hooks';
import { buildTasks, mobileAccess, taskSourcesFor, type Task } from '../lib/tasks';
import type { Route } from '../lib/navigation';
import { Badge, Button, Card, EmptyState, ErrorState, Loading, Muted, Screen } from '../ui';
import { colors, spacing } from '../theme';

interface Props {
  role: Role;
  onOpen: (route: Route) => void;
}

export function TasksScreen({ role, onOpen }: Props) {
  const access = mobileAccess(role);
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

  return (
    <Screen title="Tugas saya" onRefresh={reload} refreshing={loading && data !== null}>
      {access.reportIncident ? (
        <Button variant="error" onPress={() => onOpen({ name: 'incidentNew' })}>
          Lapor kerusakan aset
        </Button>
      ) : null}
      {data === null && loading ? <Loading /> : null}
      {data === null && error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data !== null && error ? (
        <Text style={styles.stale}>{error} Data mungkin usang.</Text>
      ) : null}
      {data?.length === 0 ? <EmptyState message="Tidak ada tugas saat ini." /> : null}
      {data?.map((task) => (
        <TaskCard key={task.key} task={task} onOpen={onOpen} />
      ))}
    </Screen>
  );
}

function TaskCard({ task, onOpen }: { task: Task; onOpen: (route: Route) => void }) {
  return (
    <Card onPress={() => onOpen(task.route)}>
      <View style={styles.head}>
        <Text style={styles.title}>{task.title}</Text>
        <Badge variant={task.badge}>{task.status}</Badge>
      </View>
      <Muted>{task.subtitle}</Muted>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { gap: spacing.sm },
  title: { fontSize: 16, fontWeight: '700', color: colors.baseContent },
  stale: { color: colors.warning, fontSize: 13 },
});
