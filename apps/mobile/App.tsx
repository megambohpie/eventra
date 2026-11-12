import { useEffect, useReducer } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getMe } from '@eventra/api-client';
import { api, sessionStore } from './src/api';
import { useSession } from './src/hooks';
import { canPop, initialNav, navReducer, type Route, type Tab } from './src/lib/navigation';
import { mobileAccess } from './src/lib/tasks';
import { LogoIcon } from './src/Logo';
import { AccountScreen } from './src/screens/AccountScreen';
import { DocumentScreen } from './src/screens/DocumentScreen';
import { IncidentNewScreen } from './src/screens/IncidentNewScreen';
import { IncidentScreen } from './src/screens/IncidentScreen';
import { IncidentsScreen } from './src/screens/IncidentsScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { PickListScreen } from './src/screens/PickListScreen';
import { ReplacementScreen } from './src/screens/ReplacementScreen';
import { TasksScreen } from './src/screens/TasksScreen';
import { Muted, TabBar, ToastHost } from './src/ui';
import { colors, spacing } from './src/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
      <ToastHost />
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}

function Root() {
  const session = useSession();

  useEffect(() => {
    void (async () => {
      await sessionStore.restore();
      if (sessionStore.get().status !== 'signedIn') return;
      // Segarkan profil/peran dari server (mengikuti perubahan RBAC); offline: pakai data tersimpan.
      try {
        const user = await getMe(api);
        const { accessToken, refreshToken } = sessionStore.get();
        if (accessToken && refreshToken)
          await sessionStore.set({ accessToken, refreshToken, user });
      } catch {
        /* galat sudah dinotifikasi/ditangani interceptor */
      }
    })();
  }, []);

  if (session.status === 'restoring') {
    return (
      <View style={styles.splash}>
        <LogoIcon size={72} />
      </View>
    );
  }
  if (session.status === 'signedOut' || !session.user) return <LoginScreen />;
  return <Signed role={session.user.role} user={session.user} />;
}

function Signed({
  role,
  user,
}: {
  role: Parameters<typeof mobileAccess>[0];
  user: NonNullable<ReturnType<typeof useSession>['user']>;
}) {
  const [nav, dispatch] = useReducer(navReducer, initialNav);
  const access = mobileAccess(role);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canPop(nav)) return false;
      dispatch({ type: 'pop' });
      return true;
    });
    return () => sub.remove();
  }, [nav]);

  const open = (route: Route) => dispatch({ type: 'push', route });
  const back = () => dispatch({ type: 'pop' });
  const top = nav.stack[nav.stack.length - 1];

  if (!access.tasks) {
    return (
      <View style={styles.splash}>
        <Muted>Peran Anda tidak memiliki akses aplikasi operasional.</Muted>
        <AccountScreen user={user} />
      </View>
    );
  }

  if (top) {
    switch (top.name) {
      case 'pickList':
        return <PickListScreen id={top.id} role={role} onBack={back} onOpen={open} />;
      case 'replacement':
        return <ReplacementScreen id={top.id} role={role} onBack={back} onOpen={open} />;
      case 'incident':
        return <IncidentScreen id={top.id} role={role} onBack={back} onOpen={open} />;
      case 'incidentNew':
        return (
          <IncidentNewScreen
            onBack={back}
            onCreated={(id) => dispatch({ type: 'replace', route: { name: 'incident', id } })}
          />
        );
      case 'document':
        return <DocumentScreen id={top.id} onBack={back} />;
    }
  }

  const tabs: { value: Tab; label: string }[] = [
    { value: 'tasks', label: 'Tugas' },
    ...(access.incidents ? [{ value: 'incidents' as const, label: 'Insiden' }] : []),
    { value: 'account', label: 'Akun' },
  ];

  return (
    <View style={styles.flex}>
      <View style={styles.flex}>
        {nav.tab === 'tasks' ? <TasksScreen role={role} onOpen={open} /> : null}
        {nav.tab === 'incidents' ? <IncidentsScreen role={role} onOpen={open} /> : null}
        {nav.tab === 'account' ? <AccountScreen user={user} /> : null}
      </View>
      <TabBar tabs={tabs} active={nav.tab} onChange={(tab) => dispatch({ type: 'tab', tab })} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.base200 },
  splash: {
    flex: 1,
    backgroundColor: colors.base200,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
});
