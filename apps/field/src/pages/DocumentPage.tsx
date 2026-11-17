import { useParams } from 'react-router-dom';
import { getHandoverDocument } from '@eventra/api-client';
import { PICK_ITEM_STATUS_BADGE, docLabel } from '@eventra/shared';
import { api } from '@/api';
import { Badge } from '@/components/Badge';
import { Card, ErrorState, Loading, Muted, Row, Screen, Section, Strong } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { formatDate, formatDateTime } from '@/lib/format';
import { CONDITION_LABEL, PICK_ITEM_STATUS_LABEL } from '@/lib/labels';

/** Tampilan baca-saja snapshot dokumen serah-terima; PDF resmi dan tanda tangan dikelola di web admin. */
export function DocumentPage() {
  const { id = '' } = useParams();
  const { data, error, loading, reload } = useAsync(() => getHandoverDocument(api, id), id);

  if (data === null) {
    return (
      <Screen title="Dokumen" back>
        {loading ? <Loading /> : <ErrorState message={error ?? 'Gagal memuat'} onRetry={reload} />}
      </Screen>
    );
  }

  const { payload } = data;
  return (
    <Screen title={`${data.number} v${data.version}`} back onRefresh={reload}>
      <Card>
        <Strong>{docLabel(data.type)}</Strong>
        <div className="ev-badges">
          <Badge variant={data.fullySigned ? 'success' : 'warning'}>
            {data.fullySigned ? 'Lengkap ditandatangani' : 'Belum lengkap ditandatangani'}
          </Badge>
          {!data.isLatest && <Badge variant="neutral">Versi lama (sudah direvisi)</Badge>}
        </div>
        <Row label="Pesanan" value={payload.orderNumber} />
        <Row label="Pelanggan" value={payload.customerName} />
        <Row label="Lokasi" value={payload.eventLocation} />
        <Row
          label="Periode"
          value={`${formatDate(payload.startDate)} – ${formatDate(payload.endDate)}`}
        />
        <Row label="Dibuat" value={formatDateTime(data.createdAt)} />
        <Row label="Oleh" value={payload.performedBy} />
        {data.revisionReason && <Row label="Alasan revisi" value={data.revisionReason} />}
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
            <Strong>{item.assetCode}</Strong>
            <Muted>
              {item.productName}
              {item.serial ? ` · ${item.serial}` : ''}
            </Muted>
            <div>
              <Badge variant={PICK_ITEM_STATUS_BADGE[item.status]}>
                {PICK_ITEM_STATUS_LABEL[item.status]}
              </Badge>
            </div>
            <Muted>
              {item.condition ? `Kondisi: ${CONDITION_LABEL[item.condition]}` : 'Kondisi: -'}
              {item.scannedAt ? ` · scan ${formatDateTime(item.scannedAt)}` : ''}
            </Muted>
            {item.note && <Muted>{item.note}</Muted>}
          </Card>
        ))}
      </Section>

      <Section title="Penandatangan">
        {data.signatures.length === 0 && <Muted>Belum ada tanda tangan.</Muted>}
        {data.signatures.map((s) => (
          <Card key={`${s.role}-${s.signedAt}`}>
            <Strong>{s.signerName}</Strong>
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
