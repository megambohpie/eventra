import { getPortalOrder } from '@eventra/api-client';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api';
import { IncidentReportForm } from '@/components/IncidentReportForm';
import { Card, ErrorState, Loading, Muted, Screen } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';

/** Pelanggan melapor kerusakan: nomor pesanan sudah pasti, cukup pilih aset di pesanan itu. */
export function PortalReportPage() {
  const [params] = useSearchParams();
  const { data, error, loading, reload } = useAsync(() => getPortalOrder(api), 'portal-order');

  if (data === null) {
    return (
      <Screen title="Lapor kerusakan" back>
        {loading ? <Loading /> : <ErrorState message={error ?? 'Gagal memuat'} onRetry={reload} />}
      </Screen>
    );
  }
  return (
    <Screen title="Lapor kerusakan" back>
      <Card>
        <Muted>Pesanan {data.number}</Muted>
      </Card>
      <IncidentReportForm
        orderNumber={data.number}
        assets={data.assets.filter((a) => a.reportable)}
        initialAsset={params.get('asset') ?? ''}
        detailBase="/p/incidents"
      />
    </Screen>
  );
}
