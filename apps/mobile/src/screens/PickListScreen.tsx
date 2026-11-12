import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
  type PickListDto,
  type Role,
} from '@eventra/shared';
import { api } from '../api';
import { confirm } from '../confirm';
import { useAsync } from '../hooks';
import { formatDate, formatDateTime } from '../lib/format';
import { CONDITION_LABEL, PICK_ITEM_STATUS_LABEL, PICK_LIST_STATUS_LABEL } from '../lib/labels';
import type { Route } from '../lib/navigation';
import type { PickedPhoto } from '../lib/photos';
import { mobileAccess } from '../lib/tasks';
import { notify } from '../lib/toast';
import { PhotoPicker } from '../PhotoPicker';
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
import { colors, spacing } from '../theme';

type Mode = 'PICK' | 'VERIFY' | 'RETURN' | null;

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

export function PickListScreen({ id, role, onBack, onOpen }: Props) {
  const access = mobileAccess(role);
  const { data, error, loading, reload, setData } = useAsync(() => getPickList(api, id), id);
  const [mode, setMode] = useState<Mode>(null);
  const [condition, setCondition] = useState<AssetCondition>('GOOD');
  const [note, setNote] = useState('');
  const [photoItem, setPhotoItem] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);

  if (data === null) {
    return (
      <Screen title="Pick list" onBack={onBack}>
        {loading ? <Loading /> : <ErrorState message={error ?? 'Gagal memuat'} onRetry={reload} />}
      </Screen>
    );
  }

  const list: PickListDto = data;
  const canScan = access.scanWarehouse;
  const outbound = list.status === 'OPEN';
  const returning = list.status === 'DISPATCHED' || list.status === 'RETURN_ISSUE';

  const onScan = async (value: ScanValue): Promise<string> => {
    if (mode === 'RETURN') {
      if (!value.qrToken) throw new Error('Pengembalian wajib memindai QR.');
      const outcome = await scanReturn(api, list.id, {
        qrToken: value.qrToken,
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

  const uploadPhotos = async (itemId: string) => {
    const remaining = [...photos];
    try {
      for (const photo of photos) {
        const outcome = await uploadReturnPhoto(api, list.id, itemId, {
          data: photo.data,
          type: photo.mimeType,
        });
        setData(outcome.pickList);
        remaining.shift();
      }
      notify('success', 'Foto kondisi terunggah.');
      setPhotoItem(null);
    } finally {
      // Foto yang gagal tetap ada agar bisa dicoba lagi tanpa mengambil ulang.
      setPhotos(remaining);
    }
  };

  const itemsByStatus = (item: PickItemDto) => item.status !== 'REMOVED';

  return (
    <Screen title={list.number} onBack={onBack} onRefresh={reload} refreshing={loading}>
      <Card>
        <Badge variant={PICK_LIST_STATUS_BADGE[list.status]}>
          {PICK_LIST_STATUS_LABEL[list.status]}
        </Badge>
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
            <Text style={styles.strong}>{line.productName}</Text>
            <Muted>
              Perlu {line.required} · dipilih {line.picked} · terverifikasi {line.verified}
            </Muted>
          </Card>
        ))}
      </Section>

      {canScan && outbound ? (
        <Section title="Persiapan keluar">
          <Muted>
            Pilih aset dengan scan QR (atau kode manual), lalu verifikasi dengan scan QR.
          </Muted>
          <Button onPress={() => setMode('PICK')}>Scan pilih aset</Button>
          <Button variant="outline" onPress={() => setMode('VERIFY')}>
            Scan verifikasi akhir
          </Button>
        </Section>
      ) : null}

      {canScan && list.status === 'VERIFIED' ? (
        <Section title="Siap keluar">
          <Muted>Semua aset sudah cocok dengan pick list.</Muted>
          <Button onPress={checkout}>Keluarkan barang</Button>
        </Section>
      ) : null}

      {canScan && returning ? (
        <Section title="Pengembalian">
          <Muted>Pilih kondisi aset, lalu scan QR-nya. Kondisi direset setelah tiap scan.</Muted>
          <Choice
            label="Kondisi saat kembali"
            value={condition}
            options={CONDITION_OPTIONS}
            onChange={setCondition}
          />
          <Field label="Catatan (opsional)" value={note} onChangeText={setNote} maxLength={500} />
          <Button onPress={() => setMode('RETURN')}>Scan pengembalian</Button>
          <Button variant="outline" onPress={complete}>
            Selesaikan pengembalian
          </Button>
        </Section>
      ) : null}

      <Section title={`Aset (${list.items.filter(itemsByStatus).length})`}>
        {list.items.filter(itemsByStatus).map((item) => (
          <Card key={item.id}>
            <View style={styles.between}>
              <Text style={styles.strong}>{item.assetCode}</Text>
              <Badge variant={PICK_ITEM_STATUS_BADGE[item.status]}>
                {PICK_ITEM_STATUS_LABEL[item.status]}
              </Badge>
            </View>
            <Muted>{item.productName}</Muted>
            {item.returnCondition ? (
              <Muted>
                Kembali: {CONDITION_LABEL[item.returnCondition]}
                {item.returnNote ? ` · ${item.returnNote}` : ''} · {item.photoIds.length} foto
              </Muted>
            ) : null}
            {canScan && item.status === 'RETURNED' && item.photoIds.length < MAX_RETURN_PHOTOS ? (
              photoItem === item.id ? (
                <View style={styles.gap}>
                  <PhotoPicker
                    photos={photos}
                    onChange={setPhotos}
                    max={MAX_RETURN_PHOTOS - item.photoIds.length}
                  />
                  <Button disabled={photos.length === 0} onPress={() => uploadPhotos(item.id)}>
                    Unggah foto
                  </Button>
                  <Button
                    variant="outline"
                    offlineOk
                    onPress={() => {
                      setPhotoItem(null);
                      setPhotos([]);
                    }}
                  >
                    Batal
                  </Button>
                </View>
              ) : (
                <Button
                  variant="outline"
                  onPress={() => {
                    setPhotos([]);
                    setPhotoItem(item.id);
                  }}
                >
                  Tambah foto kondisi
                </Button>
              )
            ) : null}
          </Card>
        ))}
      </Section>

      {access.viewDocuments && list.documents.length > 0 ? (
        <Section title="Dokumen">
          {list.documents.map((doc) => (
            <Card key={doc.id} onPress={() => onOpen({ name: 'document', id: doc.id })}>
              <Text style={styles.strong}>
                {doc.number} v{doc.version}
              </Text>
              <Muted>{docLabel(doc.type)}</Muted>
              <Badge variant={doc.fullySigned ? 'success' : 'warning'}>
                {doc.fullySigned ? 'Lengkap ditandatangani' : 'Belum lengkap'}
              </Badge>
            </Card>
          ))}
        </Section>
      ) : null}

      <Section title="Log scan terakhir">
        {list.scans.slice(0, 8).map((scan) => (
          <Muted key={scan.id}>
            {formatDateTime(scan.createdAt)} · {scan.action} · {scan.assetCode ?? '-'} ·{' '}
            {scan.result === 'OK' ? 'OK' : `Ditolak${scan.reason ? `: ${scan.reason}` : ''}`}
          </Muted>
        ))}
        {list.scans.length === 0 ? <Muted>Belum ada scan.</Muted> : null}
      </Section>

      <Scanner
        visible={mode !== null}
        title={
          mode === 'VERIFY'
            ? 'Verifikasi akhir (QR)'
            : mode === 'RETURN'
              ? `Scan pengembalian · ${CONDITION_LABEL[condition]}`
              : 'Pilih aset'
        }
        allowManual={mode === 'PICK'}
        onScan={onScan}
        onClose={() => setMode(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  strong: { fontSize: 16, fontWeight: '700', color: colors.baseContent },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  gap: { gap: spacing.sm },
});
