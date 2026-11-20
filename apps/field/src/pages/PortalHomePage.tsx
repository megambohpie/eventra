import { mdiAlertOctagon, mdiFilePdfBox, mdiLogout, mdiSignatureFreehand } from '@mdi/js';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getHandoverPdf, getPortalOrder } from '@eventra/api-client';
import { INCIDENT_STATUS_BADGE, ORDER_STATUS_BADGE, docLabel } from '@eventra/shared';
import { api } from '@/api';
import { portalLogout } from '@/auth/portal';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { PortalDocumentSign } from '@/components/PortalDocumentSign';
import {
  Card,
  EmptyState,
  ErrorState,
  Loading,
  Muted,
  Row,
  Screen,
  Section,
  Strong,
} from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { formatDate, formatDateTime, formatRupiah } from '@/lib/format';
import {
  INCIDENT_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_PURPOSE_LABEL,
  PAYMENT_STATUS_LABEL,
} from '@/lib/labels';

/** Unduh PDF dokumen langsung (token portal dikirim lewat client Axios, bukan tautan langsung). */
async function downloadPdf(id: string, filename: string): Promise<void> {
  const url = URL.createObjectURL(await getHandoverPdf(api, id));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Beranda pelanggan: satu pesanan (barang, pembayaran, kontrak/dokumen, laporan kerusakan). */
export function PortalHomePage() {
  const navigate = useNavigate();
  const [signing, setSigning] = useState<string | null>(null);
  const { data, error, loading, reload } = useAsync(() => getPortalOrder(api), 'portal-order');

  if (data === null) {
    return (
      <Screen title="Pesanan saya">
        {loading ? <Loading /> : <ErrorState message={error ?? 'Gagal memuat'} onRetry={reload} />}
      </Screen>
    );
  }

  return (
    <Screen title={data.number} onRefresh={reload}>
      <Card>
        <div className="ev-badges">
          <Badge variant={ORDER_STATUS_BADGE[data.status]}>{ORDER_STATUS_LABEL[data.status]}</Badge>
        </div>
        <Row label="Pelanggan" value={data.customerName} />
        <Row
          label="Periode"
          value={`${formatDate(data.startDate)} – ${formatDate(data.endDate)}`}
        />
        <Row label="Lokasi" value={data.eventLocation} />
        {data.eventAddress && <Row label="Alamat" value={data.eventAddress} />}
      </Card>

      <Section title={`Barang di lokasi (${data.assets.length})`}>
        {data.assets.length === 0 && <EmptyState message="Belum ada barang yang dikeluarkan." />}
        {data.assets.map((a) => (
          <Card key={a.code} to={a.reportable ? `/p/report?asset=${a.code}` : undefined}>
            <div className="ev-between">
              <div>
                <Strong>{a.code}</Strong>
                <Muted>{a.productName}</Muted>
              </div>
              {a.reportable ? (
                <Badge variant="warning">Lapor rusak</Badge>
              ) : (
                <Badge variant="neutral">Sudah dilaporkan</Badge>
              )}
            </div>
          </Card>
        ))}
        {data.assets.length > 0 && (
          <Link to="/p/report" className="btn btn-error ev-btn--block">
            <Icon path={mdiAlertOctagon} />
            Lapor kerusakan barang
          </Link>
        )}
      </Section>

      <Section title="Rincian pesanan">
        <Card>
          {data.items.map((i) => (
            <Row
              key={i.productName}
              label={`${i.quantity} × ${i.productName}`}
              value={i.unitPrice > 0 ? formatRupiah(i.unitPrice) : '—'}
            />
          ))}
          <Row label="Subtotal sewa" value={formatRupiah(data.subtotal)} />
          <Row label="Deposit" value={formatRupiah(data.depositTotal)} />
        </Card>
      </Section>

      <Section title="Pembayaran">
        {data.invoices.length === 0 && <EmptyState message="Belum ada tagihan." />}
        {data.invoices.map((inv) => (
          <Card key={inv.id}>
            <Strong>{inv.number}</Strong>
            <Row label="Total tagihan" value={formatRupiah(inv.total)} />
            <Row label="Sudah dibayar" value={formatRupiah(inv.paid)} />
            <Row label="Sisa" value={formatRupiah(inv.outstanding)} />
            <Row label="Jatuh tempo" value={formatDate(inv.dueDate)} />
            {inv.payments.map((p) => (
              <Muted key={p.id}>
                {formatDateTime(p.paidAt)} · {PAYMENT_PURPOSE_LABEL[p.purpose] ?? p.purpose} ·{' '}
                {formatRupiah(p.amount)} · {PAYMENT_METHOD_LABEL[p.method] ?? p.method} ·{' '}
                {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
              </Muted>
            ))}
          </Card>
        ))}
      </Section>

      <Section title="Kontrak & dokumen">
        {data.documents.length === 0 && <EmptyState message="Belum ada dokumen." />}
        {data.documents.map((d) => (
          <Card key={d.id}>
            <Strong>
              {d.number} v{d.version}
            </Strong>
            <Muted>{docLabel(d.type)}</Muted>
            <div className="ev-badges">
              <Badge variant={d.fullySigned ? 'success' : 'warning'}>
                {d.fullySigned ? 'Lengkap ditandatangani' : 'Belum lengkap ditandatangani'}
              </Badge>
              {d.counterpartSigned && <Badge variant="success">Anda sudah menandatangani</Badge>}
              {!d.isLatest && <Badge variant="neutral">Versi lama</Badge>}
            </div>
            <Button
              variant="ghost"
              icon={mdiFilePdfBox}
              onClick={() => downloadPdf(d.id, `${d.number}-v${d.version}.pdf`)}
            >
              Unduh PDF
            </Button>
            {d.isLatest && !d.counterpartSigned && signing !== d.id && (
              <Button
                icon={mdiSignatureFreehand}
                className="ev-btn--block"
                onClick={() => setSigning(d.id)}
              >
                Tanda tangani
              </Button>
            )}
            {signing === d.id && (
              <PortalDocumentSign
                doc={d}
                customerName={data.customerName}
                onSigned={() => {
                  setSigning(null);
                  reload();
                }}
              />
            )}
          </Card>
        ))}
      </Section>

      <Section title="Laporan kerusakan">
        {data.incidents.length === 0 && <EmptyState message="Belum ada laporan." />}
        {data.incidents.map((i) => (
          <Card key={i.id} to={`/p/incidents/${i.id}`}>
            <div className="ev-between">
              <Strong>{i.number}</Strong>
              <Badge variant={INCIDENT_STATUS_BADGE[i.status]}>
                {INCIDENT_STATUS_LABEL[i.status]}
              </Badge>
            </div>
            <Muted>
              {i.assetCode} · {i.productName}
            </Muted>
          </Card>
        ))}
      </Section>

      <Muted>
        Akses ini hanya untuk pesanan {data.number}. Punya pesanan lain? Keluar, lalu masuk dengan
        nomor pesanan tersebut.
      </Muted>
      <Button variant="ghost" className="ev-btn--block" icon={mdiLogout} onClick={portalLogout}>
        Keluar
      </Button>
      <Button
        variant="outline"
        className="ev-btn--block"
        onClick={() => {
          portalLogout();
          void navigate('/login', { replace: true });
        }}
      >
        Masuk sebagai staf
      </Button>
    </Screen>
  );
}
