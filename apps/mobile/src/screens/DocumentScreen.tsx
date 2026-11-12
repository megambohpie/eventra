import { StyleSheet, Text } from 'react-native';
import { getHandoverDocument } from '@eventra/api-client';
import { PICK_ITEM_STATUS_BADGE, docLabel } from '@eventra/shared';
import { api } from '../api';
import { useAsync } from '../hooks';
import { formatDate, formatDateTime } from '../lib/format';
import { CONDITION_LABEL, PICK_ITEM_STATUS_LABEL } from '../lib/labels';
import { Badge, Card, ErrorState, Loading, Muted, Row, Screen, Section } from '../ui';
import { colors } from '../theme';

/** Tampilan baca-saja snapshot dokumen serah-terima; PDF resmi dan tanda tangan dikelola di web. */
export function DocumentScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, error, loading, reload } = useAsync(() => getHandoverDocument(api, id), id);

  if (data === null) {
    return (
      <Screen title="Dokumen" onBack={onBack}>
        {loading ? <Loading /> : <ErrorState message={error ?? 'Gagal memuat'} onRetry={reload} />}
      </Screen>
    );
  }

  const { payload } = data;
  return (
    <Screen
      title={`${data.number} v${data.version}`}
      onBack={onBack}
      onRefresh={reload}
      refreshing={loading}
    >
      <Card>
        <Text style={styles.strong}>{docLabel(data.type)}</Text>
        <Badge variant={data.fullySigned ? 'success' : 'warning'}>
          {data.fullySigned ? 'Lengkap ditandatangani' : 'Belum lengkap ditandatangani'}
        </Badge>
        {!data.isLatest ? <Badge variant="neutral">Versi lama (sudah direvisi)</Badge> : null}
        <Row label="Pesanan" value={payload.orderNumber} />
        <Row label="Pelanggan" value={payload.customerName} />
        <Row label="Lokasi" value={payload.eventLocation} />
        <Row
          label="Periode"
          value={`${formatDate(payload.startDate)} – ${formatDate(payload.endDate)}`}
        />
        <Row label="Dibuat" value={formatDateTime(data.createdAt)} />
        <Row label="Oleh" value={payload.performedBy} />
        {data.revisionReason ? <Row label="Alasan revisi" value={data.revisionReason} /> : null}
      </Card>

      <Section title="Ringkasan">
        <Card>
          <Row label="Seharusnya" value={payload.summary.expected} />
          <Row label="Kembali" value={payload.summary.returned} />
          <Row label="Selisih" value={payload.summary.missing} />
        </Card>
      </Section>

      <Section title={`Aset (${payload.items.length})`}>
        {payload.items.map((item) => (
          <Card key={item.assetCode}>
            <Text style={styles.strong}>{item.assetCode}</Text>
            <Muted>
              {item.productName}
              {item.serial ? ` · ${item.serial}` : ''}
            </Muted>
            <Badge variant={PICK_ITEM_STATUS_BADGE[item.status]}>
              {PICK_ITEM_STATUS_LABEL[item.status]}
            </Badge>
            <Muted>
              {item.condition ? `Kondisi: ${CONDITION_LABEL[item.condition]}` : 'Kondisi: -'}
              {item.scannedAt ? ` · scan ${formatDateTime(item.scannedAt)}` : ''}
            </Muted>
            {item.note ? <Muted>{item.note}</Muted> : null}
          </Card>
        ))}
      </Section>

      <Section title="Penandatangan">
        {data.signatures.length === 0 ? <Muted>Belum ada tanda tangan.</Muted> : null}
        {data.signatures.map((s) => (
          <Card key={`${s.role}-${s.signedAt}`}>
            <Text style={styles.strong}>{s.signerName}</Text>
            <Muted>
              {s.role === 'WAREHOUSE' ? 'PIC gudang' : 'Pihak penerima/pengembali'} ·{' '}
              {formatDateTime(s.signedAt)}
            </Muted>
          </Card>
        ))}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  strong: { fontSize: 16, fontWeight: '700', color: colors.baseContent },
});
