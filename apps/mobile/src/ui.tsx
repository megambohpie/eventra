import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BadgeVariant } from '@eventra/shared';
import { dismissToast } from './lib/toast';
import { useOnline, useToasts } from './hooks';
import { badgeColors, colors, radius, spacing, touch } from './theme';

// ---------- Teks & layout ----------

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Card({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={styles.card}>{children}</View>;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export function Badge({ variant, children }: { variant: BadgeVariant; children: ReactNode }) {
  return (
    <View style={[styles.badge, { backgroundColor: badgeColors[variant] }]}>
      <Text style={styles.badgeText}>{children}</Text>
    </View>
  );
}

// ---------- Tombol & form ----------

interface ButtonProps {
  children: ReactNode;
  /** Bila mengembalikan Promise, tombol menampilkan spinner dan nonaktif sampai selesai. */
  onPress: () => void | Promise<unknown>;
  variant?: 'primary' | 'outline' | 'error';
  disabled?: boolean;
  loading?: boolean;
  /** Tetap aktif saat offline (mis. coba lagi, keluar). Default: aksi dinonaktifkan offline. */
  offlineOk?: boolean;
}

export function Button({
  children,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  offlineOk,
}: ButtonProps) {
  const [busy, setBusy] = useState(false);
  const online = useOnline();
  const isBusy = busy || Boolean(loading);
  const off = disabled || isBusy || (!online && !offlineOk);
  const outline = variant === 'outline';
  const bg = variant === 'error' ? colors.error : colors.primary;

  const press = async () => {
    setBusy(true);
    try {
      await onPress();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: isBusy }}
      disabled={off}
      onPress={() => void press()}
      style={({ pressed }) => [
        styles.button,
        outline ? styles.buttonOutline : { backgroundColor: bg },
        off && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {isBusy ? (
        <ActivityIndicator color={outline ? colors.primary : colors.primaryContent} />
      ) : (
        <Text style={[styles.buttonText, outline && { color: colors.primary }]}>{children}</Text>
      )}
    </Pressable>
  );
}

export function Field({ label, ...input }: { label: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        {...input}
        style={[styles.input, input.multiline && styles.inputMultiline]}
      />
    </View>
  );
}

/** Pilihan tetap yang sedikit (setara `select` kecil di web). */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.choices}>
        {options.map((o) => (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: o.value === value }}
            onPress={() => onChange(o.value)}
            style={[styles.choice, o.value === value && styles.choiceActive]}
          >
            <Text style={[styles.choiceText, o.value === value && styles.choiceTextActive]}>
              {o.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ---------- State ----------

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.errorText}>{message}</Text>
      <View style={styles.retry}>
        <Button variant="outline" offlineOk onPress={onRetry}>
          Coba lagi
        </Button>
      </View>
    </View>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.center}>
      <Muted>{message}</Muted>
    </View>
  );
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <View style={styles.offline} accessibilityRole="alert">
      <Text style={styles.offlineText}>
        Offline: data tidak diperbarui dan aksi scan/kirim dinonaktifkan sampai tersambung kembali.
      </Text>
    </View>
  );
}

export function ToastHost() {
  const toasts = useToasts();
  const insets = useSafeAreaInsets();
  if (!toasts.length) return null;
  return (
    <View pointerEvents="box-none" style={[styles.toasts, { bottom: insets.bottom + spacing.md }]}>
      {toasts.map((t) => (
        <Pressable
          key={t.id}
          accessibilityRole="alert"
          onPress={() => dismissToast(t.id)}
          style={[
            styles.toast,
            { backgroundColor: t.kind === 'error' ? colors.error : colors.success },
          ]}
        >
          <Text style={styles.toastText}>{t.message}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---------- Layar ----------

interface ScreenProps {
  title: string;
  onBack?: () => void;
  children: ReactNode;
  /** Pull-to-refresh. */
  onRefresh?: () => Promise<void> | void;
  refreshing?: boolean;
  /** Layar yang memuat list sendiri (tanpa ScrollView pembungkus). */
  bare?: boolean;
}

export function Screen({ title, onBack, children, onRefresh, refreshing, bare }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kembali"
            onPress={onBack}
            style={styles.back}
          >
            <Text style={styles.backText}>‹</Text>
          </Pressable>
        ) : null}
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <OfflineBanner />
      {bare ? (
        <View style={styles.flex}>{children}</View>
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={Boolean(refreshing)} onRefresh={() => void onRefresh()} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      )}
    </View>
  );
}

export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly { value: T; label: string }[];
  active: T;
  onChange: (tab: T) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.tabs, { paddingBottom: insets.bottom }]}>
      {tabs.map((t) => (
        <Pressable
          key={t.value}
          accessibilityRole="tab"
          accessibilityState={{ selected: t.value === active }}
          onPress={() => onChange(t.value)}
          style={styles.tab}
        >
          <Text style={[styles.tabText, t.value === active && styles.tabTextActive]}>
            {t.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.base200 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.base100,
    borderBottomWidth: 1,
    borderBottomColor: colors.base300,
    minHeight: 52,
    paddingHorizontal: spacing.sm,
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.baseContent, padding: 8 },
  back: { minWidth: touch.minHeight, minHeight: touch.minHeight, justifyContent: 'center' },
  backText: { fontSize: 32, color: colors.primary, textAlign: 'center' },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.lg * 2 },
  title: { fontSize: 20, fontWeight: '700', color: colors.baseContent },
  muted: { fontSize: 13, color: colors.muted },
  card: {
    backgroundColor: colors.base100,
    borderRadius: radius.box,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.base300,
  },
  pressed: { opacity: 0.75 },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.baseContent },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  rowLabel: { color: colors.muted, fontSize: 14 },
  rowValue: { color: colors.baseContent, fontSize: 14, flexShrink: 1, textAlign: 'right' },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { color: colors.primaryContent, fontSize: 12, fontWeight: '600' },
  button: {
    minHeight: touch.minHeight,
    borderRadius: radius.field,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  buttonOutline: { borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.base100 },
  buttonText: { color: colors.primaryContent, fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  field: { gap: spacing.xs },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: colors.baseContent },
  input: {
    minHeight: touch.minHeight,
    borderWidth: 1,
    borderColor: colors.base300,
    borderRadius: radius.field,
    backgroundColor: colors.base100,
    paddingHorizontal: spacing.md,
    color: colors.baseContent,
    fontSize: 16,
  },
  inputMultiline: { minHeight: 96, paddingTop: spacing.sm, textAlignVertical: 'top' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.base300,
    backgroundColor: colors.base100,
  },
  choiceActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { color: colors.baseContent, fontSize: 14 },
  choiceTextActive: { color: colors.primaryContent, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: 8 },
  errorText: { color: colors.error, textAlign: 'center', fontSize: 15 },
  retry: { alignSelf: 'stretch' },
  offline: { backgroundColor: colors.warning, padding: spacing.sm },
  offlineText: { color: colors.primaryContent, fontSize: 13, textAlign: 'center' },
  toasts: { position: 'absolute', left: spacing.md, right: spacing.md, gap: spacing.sm },
  toast: { borderRadius: radius.field, padding: spacing.md },
  toastText: { color: colors.primaryContent, fontSize: 14 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.base100,
    borderTopWidth: 1,
    borderTopColor: colors.base300,
  },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 14, color: colors.muted },
  tabTextActive: { color: colors.primary, fontWeight: '700' },
});
