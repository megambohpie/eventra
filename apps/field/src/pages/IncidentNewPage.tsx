import { useState } from 'react';
import { getDeliveryNoteReport, listReportableOrders } from '@eventra/api-client';
import { useParams } from 'react-router-dom';
import { api } from '@/api';
import { IncidentReportForm } from '@/components/IncidentReportForm';
import { Card, Choice, ErrorState, Loading, Muted, Screen } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';

/** Tujuan QR surat jalan (`/r/:token`): aset yang bisa dilaporkan otomatis dari surat jalan itu. */
export function DeliveryNoteReportPage() {
  const { token = '' } = useParams();
  const { data, error, loading, reload } = useAsync(() => getDeliveryNoteReport(api, token), token);

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
        <Muted>
          {data.documentNumber} · {data.orderNumber}
        </Muted>
        <Muted>
          {data.customerName} · {data.eventLocation}
        </Muted>
      </Card>
      <IncidentReportForm orderNumber={data.orderNumber} assets={data.assets} />
    </Screen>
  );
}

/** Lapor tanpa memindai surat jalan: pilih pesanan aktif dulu, lalu aset di pesanan itu. */
export function IncidentNewPage() {
  const { data, error, loading, reload } = useAsync(() => listReportableOrders(api), 'orders');
  const [orderNumber, setOrderNumber] = useState('');

  if (data === null) {
    return (
      <Screen title="Lapor kerusakan" back>
        {loading ? <Loading /> : <ErrorState message={error ?? 'Gagal memuat'} onRetry={reload} />}
      </Screen>
    );
  }
  const order = data.find((o) => o.number === orderNumber);
  return (
    <Screen title="Lapor kerusakan" back>
      <Muted>Tip: pindai QR pada surat jalan agar pesanan dan aset terisi otomatis.</Muted>
      <Choice
        label="Pesanan aktif"
        value={orderNumber}
        options={[
          { value: '', label: data.length ? 'Pilih pesanan…' : 'Tidak ada pesanan aktif' },
          ...data.map((o) => ({
            value: o.number,
            label: `${o.number} · ${o.customerName}`,
          })),
        ]}
        onChange={setOrderNumber}
      />
      {order && (
        <IncidentReportForm key={order.number} orderNumber={order.number} assets={order.assets} />
      )}
    </Screen>
  );
}
