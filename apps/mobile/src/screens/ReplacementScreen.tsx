import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import {
  dispatchReplacement,
  getReplacement,
  receiveReplacement,
  releaseReplacementAsset,
  scanReplacement,
} from '@eventra/api-client';
import {
  ASSET_CONDITIONS,
  INCIDENT_URGENCY_BADGE,
  REPLACEMENT_STATUS_BADGE,
  type AssetCondition,
  type Role,
} from '@eventra/shared';
import { api } from '../api';
import { confirm } from '../confirm';
import { useAsync } from '../hooks';
import { formatDateTime } from '../lib/format';
import { CONDITION_LABEL, REPLACEMENT_STATUS_LABEL, URGENCY_LABEL } from '../lib/labels';
import type { Route } from '../lib/navigation';
import { mobileAccess } from '../lib/tasks';
import { notify } from '../lib/toast';
import { Scanner, type ScanValue } from '../Scanner';
import {
  Badge,
  Button,
  Card,
  Choice,
  ErrorState,
  Field,
  Loading,
  Muted,
  Row,
  Screen,
  Section,
} from '../ui';
import { colors } from '../theme';

type Mode = 'PICK' | 'VERIFY' | 'RECEIVE' | null;

const CONDITION_OPTIONS = ASSET_CONDITIONS.map((value) => ({
  value,
  label: CONDITION_LABEL[value],
}));

interface Props {
  id: string;
  role: Role;
  onBack: () => void;
  onOpen: (route: Route) => void;
}

export function ReplacementScreen({ id, role, onBack, onOpen }: Props) {
  const access = mobileAccess(role);
  const { data, error, loading, reload, setData } = useAsync(() => getReplacement(api, id), id);
  const [mode, setMode] = useState<Mode>(null);
  const [condition, setCondition] = useState<AssetCondition>('GOOD');
  const [note, setNote] = useState('');

  if (data === null) {
    return (
      <Screen title="Penggantian" onBack={onBack}>
        {loading ? <Loading /> : <ErrorState message={error ?? 'Gagal memuat'} onRetry={reload} />}
      </Screen>
    );
  }

  const task = data;
  const preparing =
    access.scanWarehouse &&
    (task.status === 'PENDING_PICK' || task.status === 'PICKED' || task.status === 'VERIFIED');
  const canReceive = access.receiveReplacement && task.status === 'DISPATCHED';

  const onScan = async (value: ScanValue): Promise<string> => {
    if (mode === 'RECEIVE') {
      if (!value.qrToken) throw new Error('Penerimaan wajib memindai QR aset pengganti.');
      const updated = await receiveReplacement(api, task.id, {
        qrToken: value.qrToken,
        condition,
        note: note.trim() || undefined,
      });
      setData(updated);
      setNote('');
      notify('success', 'Aset pengganti diterima dan masuk daftar pesanan.');
      return 'Diterima';
    }
    const action = mode === 'VERIFY' ? 'VERIFY' : 'PICK';
    const updated = await scanReplacement(api, task.id, { action, ...value });
    setData(updated);
    return action === 'VERIFY' ? 'Aset pengganti terverifikasi' : 'Aset pengganti dipilih';
  };

  const release = async () => {
    if (!(await confirm('Lepas aset pengganti?', 'Aset akan dikembalikan ke stok gudang.'))) return;
    setData(await releaseReplacementAsset(api, task.id));
  };

  const dispatch = async () => {
    if (
      !(await confirm(
        'Kirim aset pengganti?',
        'Aset ditandai dalam perjalanan ke lokasi.',
        'Kirim',
      ))
    ) {
      return;
    }
    setData(await dispatchReplacement(api, task.id));
    notify('success', 'Aset pengganti dikirim.');
  };

  return (
    <Screen title={task.number} onBack={onBack} onRefresh={reload} refreshing={loading}>
      <Card>
        <Badge variant={REPLACEMENT_STATUS_BADGE[task.status]}>
          {REPLACEMENT_STATUS_LABEL[task.status]}
        </Badge>
        <Badge variant={INCIDENT_URGENCY_BADGE[task.urgency]}>{URGENCY_LABEL[task.urgency]}</Badge>
        <Row label="Produk" value={task.productName} />
        <Row label="Pesanan" value={task.orderNumber} />
        <Row label="Lokasi" value={task.eventLocation} />
        <Row label="Aset rusak" value={task.oldAsset.code} />
        <Row label="Aset pengganti" value={task.replacementAsset?.code ?? '-'} />
        {access.incidents ? (
          <Button
            variant="outline"
            onPress={() => onOpen({ name: 'incident', id: task.incidentId })}
          >
            Lihat insiden {task.incidentNumber}
          </Button>
        ) : null}
      </Card>

      {preparing ? (
        <Section title="Siapkan aset pengganti">
          <Muted>Harus produk yang sama, bukan aset rusak, dan berstatus tersedia.</Muted>
          {task.status === 'PENDING_PICK' ? (
            <Button onPress={() => setMode('PICK')}>Scan pilih aset</Button>
          ) : null}
          {task.status === 'PICKED' ? (
            <>
              <Button onPress={() => setMode('VERIFY')}>Scan verifikasi (QR)</Button>
              <Button variant="outline" onPress={release}>
                Lepas aset
              </Button>
            </>
          ) : null}
          {task.status === 'VERIFIED' ? <Button onPress={dispatch}>Kirim ke lokasi</Button> : null}
        </Section>
      ) : null}

      {canReceive ? (
        <Section title="Terima aset pengganti">
          <Muted>
            Periksa fisik aset, pilih kondisinya, lalu scan QR aset pengganti
            {task.replacementAsset ? ` (${task.replacementAsset.code})` : ''}.
          </Muted>
          <Choice
            label="Kondisi saat diterima"
            value={condition}
            options={CONDITION_OPTIONS}
            onChange={setCondition}
          />
          <Field label="Catatan (opsional)" value={note} onChangeText={setNote} maxLength={500} />
          <Button onPress={() => setMode('RECEIVE')}>Scan & terima</Button>
        </Section>
      ) : null}

      {task.status === 'RECEIVED' ? (
        <Card>
          <Text style={styles.ok}>
            Diterima {task.receivedAt ? formatDateTime(task.receivedAt) : ''}
          </Text>
          <Muted>
            {task.receivedBy ?? ''}
            {task.receiveCondition ? ` · ${CONDITION_LABEL[task.receiveCondition]}` : ''}
            {task.receiveNote ? ` · ${task.receiveNote}` : ''}
          </Muted>
        </Card>
      ) : null}

      <Scanner
        visible={mode !== null}
        title={
          mode === 'RECEIVE'
            ? 'Scan QR aset pengganti'
            : mode === 'VERIFY'
              ? 'Verifikasi aset pengganti (QR)'
              : 'Pilih aset pengganti'
        }
        allowManual={mode === 'PICK'}
        closeOnSuccess={mode === 'RECEIVE'}
        onScan={onScan}
        onClose={() => setMode(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  ok: { color: colors.success, fontWeight: '700', fontSize: 16 },
});
