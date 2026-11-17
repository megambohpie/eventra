import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
} from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Scanner, type ScanValue } from '@/components/Scanner';
import {
  Card,
  Choice,
  ErrorState,
  Field,
  Loading,
  Muted,
  Row,
  Screen,
  Section,
  Strong,
} from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { confirm } from '@/lib/confirm';
import { formatDateTime } from '@/lib/format';
import { CONDITION_LABEL, REPLACEMENT_STATUS_LABEL, URGENCY_LABEL } from '@/lib/labels';
import { notify } from '@/lib/notifications';

type Mode = 'PICK' | 'VERIFY' | 'RECEIVE' | null;

const CONDITION_OPTIONS = ASSET_CONDITIONS.map((value) => ({
  value,
  label: CONDITION_LABEL[value],
}));

export function ReplacementPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const { data, error, loading, reload, setData } = useAsync(() => getReplacement(api, id), id);
  const [mode, setMode] = useState<Mode>(null);
  const [condition, setCondition] = useState<AssetCondition>('GOOD');
  const [note, setNote] = useState('');

  if (data === null) {
    return (
      <Screen title="Penggantian" back>
        {loading ? <Loading /> : <ErrorState message={error ?? 'Gagal memuat'} onRetry={reload} />}
      </Screen>
    );
  }

  const task = data;
  const preparing =
    can('warehouse.write') &&
    (task.status === 'PENDING_PICK' || task.status === 'PICKED' || task.status === 'VERIFIED');
  const canReceive = can('replacement.receive') && task.status === 'DISPATCHED';

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
    <Screen title={task.number} back onRefresh={reload}>
      <Card>
        <div className="ev-badges">
          <Badge variant={REPLACEMENT_STATUS_BADGE[task.status]}>
            {REPLACEMENT_STATUS_LABEL[task.status]}
          </Badge>
          <Badge variant={INCIDENT_URGENCY_BADGE[task.urgency]}>
            {URGENCY_LABEL[task.urgency]}
          </Badge>
        </div>
        <Row label="Produk" value={task.productName} />
        <Row label="Pesanan" value={task.orderNumber} />
        <Row label="Lokasi" value={task.eventLocation} />
        <Row label="Aset rusak" value={task.oldAsset.code} />
        <Row label="Aset pengganti" value={task.replacementAsset?.code ?? '-'} />
        {can('incident.read') && (
          <Link className="btn btn-ghost ev-btn--block" to={`/incidents/${task.incidentId}`}>
            Lihat insiden {task.incidentNumber}
          </Link>
        )}
      </Card>

      {preparing && (
        <Section title="Siapkan aset pengganti">
          <Muted>Harus produk yang sama, bukan aset rusak, dan berstatus tersedia.</Muted>
          {task.status === 'PENDING_PICK' && (
            <Button className="ev-btn--block" onClick={() => setMode('PICK')}>
              Scan pilih aset
            </Button>
          )}
          {task.status === 'PICKED' && (
            <>
              <Button className="ev-btn--block" onClick={() => setMode('VERIFY')}>
                Scan verifikasi (QR)
              </Button>
              <Button variant="ghost" className="ev-btn--block" onClick={release}>
                Lepas aset
              </Button>
            </>
          )}
          {task.status === 'VERIFIED' && (
            <Button className="ev-btn--block" onClick={dispatch}>
              Kirim ke lokasi
            </Button>
          )}
        </Section>
      )}

      {canReceive && (
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
          <Field label="Catatan (opsional)">
            <input
              className="input ev-control"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <Button className="ev-btn--block" onClick={() => setMode('RECEIVE')}>
            Scan & terima
          </Button>
        </Section>
      )}

      {task.status === 'RECEIVED' && (
        <Card>
          <Strong>Diterima {task.receivedAt ? formatDateTime(task.receivedAt) : ''}</Strong>
          <Muted>
            {task.receivedBy ?? ''}
            {task.receiveCondition ? ` · ${CONDITION_LABEL[task.receiveCondition]}` : ''}
            {task.receiveNote ? ` · ${task.receiveNote}` : ''}
          </Muted>
        </Card>
      )}

      <Scanner
        open={mode !== null}
        title={
          mode === 'RECEIVE'
            ? 'Scan QR aset pengganti'
            : mode === 'VERIFY'
              ? 'Verifikasi aset pengganti (QR)'
              : 'Pilih aset pengganti'
        }
        allowManual={mode === 'PICK' || can('scan.manual')}
        closeOnSuccess={mode === 'RECEIVE'}
        onScan={onScan}
        onClose={() => setMode(null)}
      />
    </Screen>
  );
}
