import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  checkoutPickList,
  completeReturn,
  getPickList,
  scanPickList,
  scanReturn,
  uploadReturnPhoto,
} from '@eventra/api-client';
import {
  ASSET_CONDITIONS,
  MAX_RETURN_PHOTOS,
  PICK_ITEM_STATUS_BADGE,
  PICK_LIST_STATUS_BADGE,
  docLabel,
  type AssetCondition,
  type PickItemDto,
} from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { PhotoSlot } from '@/components/PhotoSlot';
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
import { confirm } from '@/lib/confirm';
import { useAsync } from '@/hooks/useAsync';
import { formatDate, formatDateTime } from '@/lib/format';
import { CONDITION_LABEL, PICK_ITEM_STATUS_LABEL, PICK_LIST_STATUS_LABEL } from '@/lib/labels';
import { notify } from '@/lib/notifications';

type Mode = 'PICK' | 'VERIFY' | 'RETURN' | null;

const CONDITION_OPTIONS = ASSET_CONDITIONS.map((value) => ({
  value,
  label: CONDITION_LABEL[value],
}));

export function PickListPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const { data, error, loading, reload, setData } = useAsync(() => getPickList(api, id), id);
  const [mode, setMode] = useState<Mode>(null);
  const [condition, setCondition] = useState<AssetCondition>('GOOD');
  const [note, setNote] = useState('');
  const [photoItem, setPhotoItem] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | undefined>();

  if (data === null) {
    return (
      <Screen title="Pick list" back>
        {loading ? <Loading /> : <ErrorState message={error ?? 'Gagal memuat'} onRetry={reload} />}
      </Screen>
    );
  }

  const list = data;
  const canScan = can('warehouse.write');
  const manualOk = can('scan.manual');
  const outbound = list.status === 'OPEN';
  const returning = list.status === 'DISPATCHED' || list.status === 'RETURN_ISSUE';

  const onScan = async (value: ScanValue): Promise<string> => {
    if (mode === 'RETURN') {
      const outcome = await scanReturn(api, list.id, {
        ...value,
        condition,
        note: note.trim() || undefined,
      });
      setData(outcome.pickList);
      // Kondisi/catatan tidak boleh terbawa ke aset berikutnya.
      setCondition('GOOD');
      setNote('');
      return `${outcome.item.assetCode} kembali (${CONDITION_LABEL[condition]})`;
    }
    const action = mode === 'VERIFY' ? 'VERIFY' : 'PICK';
    const outcome = await scanPickList(api, list.id, { action, ...value });
    setData(outcome.pickList);
    return `${outcome.item.assetCode} ${action === 'VERIFY' ? 'terverifikasi' : 'dipilih'}`;
  };

  const checkout = async () => {
    const ok = await confirm(
      'Keluarkan barang?',
      'Aset akan ditandai keluar gudang dan surat jalan dibuat. Tindakan ini tidak dapat dibatalkan.',
      'Keluarkan',
    );
    if (!ok) return;
    setData(await checkoutPickList(api, list.id));
    notify('success', 'Barang keluar dicatat. Surat jalan dibuat.');
  };

  const complete = async () => {
    const outstanding = list.items.filter((i) => i.status === 'DISPATCHED').length;
    let acceptMissing = false;
    if (outstanding > 0) {
      acceptMissing = await confirm(
        'Ada aset belum kembali',
        `${outstanding} aset belum discan dan akan ditandai hilang/selisih. Lanjutkan?`,
        'Tandai selisih',
      );
      if (!acceptMissing) return;
    }
    setData(await completeReturn(api, list.id, { acceptMissing }));
    notify('success', 'Pengembalian diselesaikan. Berita acara dibuat.');
  };

  const uploadPhoto = async (itemId: string) => {
    if (!photo) return;
    const outcome = await uploadReturnPhoto(api, list.id, itemId, photo);
    setData(outcome.pickList);
    notify('success', 'Foto kondisi terunggah.');
    setPhoto(undefined);
    setPhotoItem(null);
  };

  const visible = list.items.filter((item: PickItemDto) => item.status !== 'REMOVED');

  return (
    <Screen title={list.number} back onRefresh={reload}>
      <Card>
        <div>
          <Badge variant={PICK_LIST_STATUS_BADGE[list.status]}>
            {PICK_LIST_STATUS_LABEL[list.status]}
          </Badge>
        </div>
        <Row label="Pesanan" value={list.orderNumber} />
        <Row label="Pelanggan" value={list.customerName} />
        <Row label="Lokasi" value={list.eventLocation} />
        <Row
          label="Tanggal"
          value={`${formatDate(list.startDate)} – ${formatDate(list.endDate)}`}
        />
      </Card>

      <Section title="Kebutuhan">
        {list.lines.map((line) => (
          <Card key={line.productId}>
            <Strong>{line.productName}</Strong>
            <Muted>
              Perlu {line.required} · dipilih {line.picked} · terverifikasi {line.verified}
            </Muted>
          </Card>
        ))}
      </Section>

      {canScan && outbound && (
        <Section title="Persiapan keluar">
          <Muted>
            Pilih aset dengan scan QR (atau kode manual), lalu verifikasi dengan scan QR.
          </Muted>
          <Button className="ev-btn--block" onClick={() => setMode('PICK')}>
            Scan pilih aset
          </Button>
          <Button variant="ghost" className="ev-btn--block" onClick={() => setMode('VERIFY')}>
            Scan verifikasi akhir
          </Button>
        </Section>
      )}

      {canScan && list.status === 'VERIFIED' && (
        <Section title="Siap keluar">
          <Muted>Semua aset sudah cocok dengan pick list.</Muted>
          <Button className="ev-btn--block" onClick={checkout}>
            Keluarkan barang
          </Button>
        </Section>
      )}

      {canScan && returning && (
        <Section title="Pengembalian">
          <Muted>Pilih kondisi aset, lalu scan QR-nya. Kondisi direset setelah tiap scan.</Muted>
          <Choice
            label="Kondisi saat kembali"
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
          <Button className="ev-btn--block" onClick={() => setMode('RETURN')}>
            Scan pengembalian
          </Button>
          <Button variant="ghost" className="ev-btn--block" onClick={complete}>
            Selesaikan pengembalian
          </Button>
        </Section>
      )}

      <Section title={`Aset (${visible.length})`}>
        {visible.map((item) => (
          <Card key={item.id}>
            <div className="ev-between">
              <Strong>{item.assetCode}</Strong>
              <Badge variant={PICK_ITEM_STATUS_BADGE[item.status]}>
                {PICK_ITEM_STATUS_LABEL[item.status]}
              </Badge>
            </div>
            <Muted>{item.productName}</Muted>
            {item.returnCondition && (
              <Muted>
                Kembali: {CONDITION_LABEL[item.returnCondition]}
                {item.returnNote ? ` · ${item.returnNote}` : ''} · {item.photoIds.length} foto
              </Muted>
            )}
            {canScan && item.status === 'RETURNED' && item.photoIds.length < MAX_RETURN_PHOTOS && (
              <>
                {photoItem === item.id ? (
                  <>
                    <PhotoSlot label="Foto kondisi" file={photo} onChange={setPhoto} />
                    <Button disabled={!photo} onClick={() => uploadPhoto(item.id)}>
                      Unggah foto
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setPhotoItem(null);
                        setPhoto(undefined);
                      }}
                    >
                      Batal
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setPhoto(undefined);
                      setPhotoItem(item.id);
                    }}
                  >
                    Tambah foto kondisi
                  </Button>
                )}
              </>
            )}
          </Card>
        ))}
      </Section>

      {can('warehouse.read') && list.documents.length > 0 && (
        <Section title="Dokumen">
          {list.documents.map((doc) => (
            <Card key={doc.id} to={`/documents/${doc.id}`}>
              <Strong>
                {doc.number} v{doc.version}
              </Strong>
              <Muted>{docLabel(doc.type)}</Muted>
              <div>
                <Badge variant={doc.fullySigned ? 'success' : 'warning'}>
                  {doc.fullySigned ? 'Lengkap ditandatangani' : 'Belum lengkap'}
                </Badge>
              </div>
            </Card>
          ))}
        </Section>
      )}

      <Section title="Log scan terakhir">
        {list.scans.slice(0, 8).map((scan) => (
          <Muted key={scan.id}>
            {formatDateTime(scan.createdAt)} · {scan.action} · {scan.assetCode ?? '-'} ·{' '}
            {scan.result === 'OK' ? 'OK' : `Ditolak${scan.reason ? `: ${scan.reason}` : ''}`}
          </Muted>
        ))}
        {list.scans.length === 0 && <Muted>Belum ada scan.</Muted>}
      </Section>

      <Scanner
        open={mode !== null}
        title={
          mode === 'VERIFY'
            ? 'Verifikasi akhir (QR)'
            : mode === 'RETURN'
              ? `Scan pengembalian · ${CONDITION_LABEL[condition]}`
              : 'Pilih aset'
        }
        allowManual={mode === 'PICK' || manualOk}
        onScan={onScan}
        onClose={() => setMode(null)}
      />
    </Screen>
  );
}
