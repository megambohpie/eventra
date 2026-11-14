import { useTranslation } from 'react-i18next';
import { getAssetBatches } from '@eventra/api-client';
import { ASSET_STATUSES, type AssetBatchDto, type AssetGroupQuery } from '@eventra/shared';
import { api } from '@/api';
import { AssetStatusBadge } from '@/components/assets/badges';
import { Loading } from '@/components/ui/Loading';
import { useResource } from '@/hooks/useResource';
import { formatDate } from '@/lib/format';

interface AssetBatchListProps {
  productId: string;
  filters: Omit<AssetGroupQuery, 'page' | 'pageSize'>;
  onOpen: (batch: AssetBatchDto) => void;
}

/** Kelompok pembelian satu barang (per tanggal perolehan); klik untuk melihat unitnya. */
export function AssetBatchList({ productId, filters, onOpen }: AssetBatchListProps) {
  const { t } = useTranslation();
  const { data } = useResource(
    () => getAssetBatches(api, productId, filters),
    `asset-batches|${productId}|${JSON.stringify(filters)}`,
  );
  if (!data) return <Loading />;
  if (data.length === 0) return <p className="ev-hint">{t('common.empty')}</p>;

  return (
    <ul className="ev-batchlist">
      {data.map((batch) => {
        const counts = ASSET_STATUSES.map(
          (s) => [s, batch.assets.filter((a) => a.status === s).length] as const,
        ).filter(([, n]) => n > 0);
        return (
          <li key={batch.date}>
            <button type="button" className="ev-batchlist__item" onClick={() => onOpen(batch)}>
              <span className="ev-batchlist__date">
                {batch.batchLabels.length > 0 && `${batch.batchLabels.join(', ')} · `}
                {t('assets.batch.title', { date: formatDate(batch.date) })}
                <span className="ev-table__hint ev-table__hint--block">
                  {batch.brands
                    .map((b) => `${b.brand ?? t('assets.noBrand')} ×${b.quantity}`)
                    .join(', ')}
                </span>
              </span>
              <span className="ev-qty">{t('assets.batch.units', { count: batch.quantity })}</span>
              <span className="ev-chips">
                {counts.map(([s, n]) => (
                  <span key={s} className="ev-chip">
                    <AssetStatusBadge status={s} /> {n}
                  </span>
                ))}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
