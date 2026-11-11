import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getHealth } from '@eventra/api-client';
import { api } from './src/api';
import { Logo, LogoIcon } from './src/Logo';
import { colors, radius, spacing } from './src/theme';

type State = { kind: 'loading' } | { kind: 'ok'; db: string } | { kind: 'error'; message: string };

export default function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    getHealth(api)
      .then((h) => active && setState({ kind: 'ok', db: h.db }))
      .catch(
        (e: unknown) =>
          active &&
          setState({ kind: 'error', message: e instanceof Error ? e.message : 'Gagal memuat' }),
      );
    return () => {
      active = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Logo />
        {state.kind === 'loading' && <LogoIcon />}
        {state.kind === 'ok' && (
          <Text style={{ color: colors.success }}>API OK · DB {state.db}</Text>
        )}
        {state.kind === 'error' && <Text style={{ color: colors.error }}>{state.message}</Text>}
      </View>
      <Text style={styles.footer}>Sistem ini dibuat oleh PT Trijaya Digital Koneksindo.</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.base200,
    padding: spacing.md,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.base100,
    borderRadius: radius.box,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  footer: { marginTop: spacing.lg, textAlign: 'center', color: colors.baseContent, fontSize: 12 },
});
