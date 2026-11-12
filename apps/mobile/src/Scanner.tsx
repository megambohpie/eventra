import { useMemo, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage } from './lib/errors';
import { createScanGate, parseAssetCode, parseQrToken } from './lib/qr';
import { Button, Field, Muted } from './ui';
import { colors, radius, spacing } from './theme';

export type ScanValue =
  { qrToken: string; assetCode?: undefined } | { assetCode: string; qrToken?: undefined };

interface ScannerProps {
  visible: boolean;
  title: string;
  /**
   * Dipanggil untuk setiap QR/kode yang terbaca. Kembalikan teks sukses untuk ditampilkan; lempar
   * error bila ditolak. Pemindai tetap terbuka agar gudang dapat memindai banyak aset berurutan.
   */
  onScan: (value: ScanValue) => Promise<string | void>;
  onClose: () => void;
  /** Kode aset manual hanya untuk aksi yang mengizinkannya (mis. memilih aset; verifikasi wajib QR). */
  allowManual?: boolean;
  /** Tutup otomatis setelah satu scan berhasil (aksi satu aset, mis. menerima pengganti). */
  closeOnSuccess?: boolean;
}

type Feedback = { ok: boolean; text: string } | null;

export function Scanner({
  visible,
  title,
  onScan,
  onClose,
  allowManual,
  closeOnSuccess,
}: ScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [manual, setManual] = useState('');
  const busy = useRef(false);
  const gate = useMemo(() => createScanGate(2000), []);
  const insets = useSafeAreaInsets();

  const submit = async (value: ScanValue) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const text = await onScan(value);
      if (closeOnSuccess) {
        setFeedback(null);
        onClose();
      } else {
        setFeedback({ ok: true, text: text || 'Berhasil' });
      }
    } catch (e) {
      setFeedback({ ok: false, text: errorMessage(e) });
    } finally {
      busy.current = false;
    }
  };

  const onBarcode = (data: string) => {
    if (!gate(data)) return;
    const qrToken = parseQrToken(data);
    if (!qrToken) {
      setFeedback({ ok: false, text: 'Bukan QR Eventra yang valid.' });
      return;
    }
    void submit({ qrToken });
  };

  const submitManual = async () => {
    const assetCode = parseAssetCode(manual);
    if (!assetCode) {
      setFeedback({ ok: false, text: 'Kode aset tidak valid (contoh: AST-000123).' });
      return;
    }
    await submit({ assetCode });
    setManual('');
  };

  const close = () => {
    setFeedback(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Text style={styles.title}>{title}</Text>
        {permission?.granted ? (
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => onBarcode(data)}
          />
        ) : (
          <View style={styles.camera}>
            <Text style={styles.permission}>
              {permission && !permission.canAskAgain
                ? 'Izin kamera ditolak. Aktifkan izin kamera di pengaturan perangkat.'
                : 'Izin kamera diperlukan untuk memindai QR.'}
            </Text>
            {permission?.canAskAgain !== false ? (
              <Button offlineOk onPress={() => requestPermission()}>
                Izinkan kamera
              </Button>
            ) : null}
          </View>
        )}
        {feedback ? (
          <Text
            accessibilityRole="alert"
            style={[
              styles.feedback,
              { backgroundColor: feedback.ok ? colors.success : colors.error },
            ]}
          >
            {feedback.text}
          </Text>
        ) : null}
        <View style={styles.footer}>
          {allowManual ? (
            <View style={styles.manual}>
              <Muted>QR rusak? Masukkan kode aset secara manual.</Muted>
              <Field
                label="Kode aset"
                value={manual}
                onChangeText={setManual}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="AST-000123"
              />
              <Button variant="outline" disabled={!manual.trim()} onPress={submitManual}>
                Kirim kode
              </Button>
            </View>
          ) : null}
          <Button offlineOk onPress={close}>
            Selesai
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral },
  title: { color: colors.primaryContent, fontSize: 18, fontWeight: '700', padding: spacing.md },
  camera: {
    flex: 1,
    margin: spacing.md,
    borderRadius: radius.box,
    overflow: 'hidden',
    backgroundColor: colors.baseContent,
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  permission: { color: colors.primaryContent, textAlign: 'center', fontSize: 15 },
  feedback: {
    color: colors.primaryContent,
    marginHorizontal: spacing.md,
    padding: spacing.md,
    borderRadius: radius.field,
    fontSize: 15,
    overflow: 'hidden',
  },
  footer: { padding: spacing.md, gap: spacing.sm },
  manual: {
    gap: spacing.sm,
    backgroundColor: colors.base100,
    padding: spacing.md,
    borderRadius: radius.box,
  },
});
