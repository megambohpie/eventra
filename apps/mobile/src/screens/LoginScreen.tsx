import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { loginSchema } from '@eventra/shared';
import { login } from '@eventra/api-client';
import { api, sessionStore } from '../api';
import { errorMessage } from '../lib/errors';
import { Logo } from '../Logo';
import { Button, Field, Muted, OfflineBanner } from '../ui';
import { colors, radius, spacing } from '../theme';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError('Masukkan email yang valid dan kata sandi.');
      return;
    }
    try {
      await sessionStore.set(await login(api, parsed.data));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <OfflineBanner />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Logo />
          <Text style={styles.title}>Masuk</Text>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <Field
            label="Kata sandi"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            textContentType="password"
            onSubmitEditing={() => void submit()}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button onPress={submit}>Masuk</Button>
        </View>
        <Muted>Sistem ini dibuat oleh PT Trijaya Digital Koneksindo.</Muted>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.base200 },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.md, gap: spacing.lg },
  card: {
    backgroundColor: colors.base100,
    borderRadius: radius.box,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.baseContent },
  error: { color: colors.error, fontSize: 14 },
});
