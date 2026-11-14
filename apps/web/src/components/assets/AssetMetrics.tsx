import { useTranslation } from 'react-i18next';
import { getAssetMetrics } from '@eventra/api-client';
import { api } from '@/api';
import { Loading } from '@/components/ui/Loading';
import { PageCard } from '@/components/ui/PageCard';
import { useResource } from '@/hooks/useResource';
import { formatRupiah } from '@/lib/format';

/** Umur pakai aset: umur, harga beli, jumlah/hari sewa, servis, dan insiden. Biaya hanya bila diizinkan API. */
export function AssetMetrics({
  assetId,
  embedded = false,
  onOpenRentals,
  onOpenServices,
}: {
  assetId: string;
  embedded?: boolean;
  /** Bila ada, jumlah sewa menjadi tombol yang membuka rincian riwayat sewa. */
  onOpenRentals?: () => void;
  onOpenServices?: () => void;
}) {
  const { t } = useTranslation();
  const { data, loading } = useResource(() => getAssetMetrics(api, assetId), `metrics-${assetId}`);
  if (loading && !data) return <Loading />;
  if (!data) return null;

  type Row = [label: string, value: string, onOpen?: () => void];
  const rows: Row[] = [
    [t('assets.metrics.age'), t('assets.metrics.ageValue', { count: data.ageDays ?? 0 })],
    ...(data.purchasePrice === null
      ? []
      : [[t('assets.metrics.purchasePrice'), formatRupiah(data.purchasePrice)] as Row]),
    [
      t('assets.metrics.rentals'),
      String(data.rentalCount),
      data.rentalCount > 0 ? onOpenRentals : undefined,
    ],
    [t('assets.metrics.rentalDays'), String(data.rentalDays)],
    [
      t('assets.metrics.services'),
      String(data.serviceCount),
      data.serviceCount > 0 ? onOpenServices : undefined,
    ],
    ...(data.serviceCost === null
      ? []
      : [[t('assets.metrics.serviceCost'), formatRupiah(data.serviceCost)] as Row]),
    [t('assets.metrics.incidents'), String(data.incidentCount)],
  ];

  const content = (
    <>
      <h2 className="ev-section-title">{t('assets.metrics.title')}</h2>
      <dl className="ev-dl ev-dl--cols">
        {rows.map(([label, value, onOpen]) => (
          <div key={label} className="ev-dl__row">
            <dt className="ev-dl__term">{label}</dt>
            <dd className="ev-dl__desc">
              {onOpen ? (
                <button
                  type="button"
                  className="ev-count-link"
                  title={t('assets.history.openDetail')}
                  onClick={onOpen}
                >
                  {value}
                </button>
              ) : (
                value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
  return embedded ? (
    <section className="ev-assetdetail__panel">{content}</section>
  ) : (
    <PageCard>{content}</PageCard>
  );
}
