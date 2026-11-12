import { useTranslation } from 'react-i18next';
import { getAssetMetrics } from '@eventra/api-client';
import { api } from '@/api';
import { Loading } from '@/components/ui/Loading';
import { PageCard } from '@/components/ui/PageCard';
import { useResource } from '@/hooks/useResource';
import { formatRupiah } from '@/lib/format';

/** Umur pakai aset: umur, harga beli, jumlah/hari sewa, servis, dan insiden. Biaya hanya bila diizinkan API. */
export function AssetMetrics({ assetId }: { assetId: string }) {
  const { t } = useTranslation();
  const { data, loading } = useResource(() => getAssetMetrics(api, assetId), `metrics-${assetId}`);
  if (loading && !data) return <Loading />;
  if (!data) return null;

  const rows: [string, string][] = [
    [t('assets.metrics.age'), t('assets.metrics.ageValue', { count: data.ageDays ?? 0 })],
    ...(data.purchasePrice === null
      ? []
      : ([[t('assets.metrics.purchasePrice'), formatRupiah(data.purchasePrice)]] as [
          string,
          string,
        ][])),
    [t('assets.metrics.rentals'), String(data.rentalCount)],
    [t('assets.metrics.rentalDays'), String(data.rentalDays)],
    [t('assets.metrics.services'), String(data.serviceCount)],
    ...(data.serviceCost === null
      ? []
      : ([[t('assets.metrics.serviceCost'), formatRupiah(data.serviceCost)]] as [
          string,
          string,
        ][])),
    [t('assets.metrics.incidents'), String(data.incidentCount)],
  ];

  return (
    <PageCard>
      <h2 className="ev-section-title">{t('assets.metrics.title')}</h2>
      <dl className="ev-dl">
        {rows.map(([label, value]) => (
          <div key={label} className="ev-dl__row">
            <dt className="ev-dl__term">{label}</dt>
            <dd className="ev-dl__desc">{value}</dd>
          </div>
        ))}
      </dl>
    </PageCard>
  );
}
