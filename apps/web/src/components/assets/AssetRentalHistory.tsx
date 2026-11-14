import { useTranslation } from 'react-i18next';
import { listAssetRentals } from '@eventra/api-client';
import { api } from '@/api';
import { ConditionBadge } from '@/components/assets/badges';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { Loading } from '@/components/ui/Loading';
import { useResource } from '@/hooks/useResource';
import { formatDate, formatDateTime } from '@/lib/format';

/** Riwayat sewa satu unit: pesanan, penyewa, periode, serta kondisi saat keluar dan kembali. */
export function AssetRentalHistory({ assetId }: { assetId: string }) {
  const { t } = useTranslation();
  const { data } = useResource(() => listAssetRentals(api, assetId), `rentals-${assetId}`);
  if (!data) return <Loading />;
  if (data.length === 0) return <p className="ev-hint">{t('assets.history.noRentals')}</p>;

  return (
    <ul className="ev-history">
      {data.map((r) => (
        <li key={`${r.orderId}-${r.dispatchedAt}`} className="ev-history__item">
          <div className="ev-history__head">
            <strong>{r.orderNumber}</strong>
            <OrderStatusBadge status={r.orderStatus} />
          </div>
          <p className="ev-history__line">
            {r.customerName} · {r.eventLocation}
          </p>
          <p className="ev-history__meta">
            {formatDate(r.startDate)} – {formatDate(r.endDate)} (
            {t('orders.days', { count: r.days })})
          </p>
          <p className="ev-history__meta">
            {t('assets.history.out')} {formatDateTime(r.dispatchedAt)}
            {' · '}
            {r.returnedAt
              ? `${t('assets.history.back')} ${formatDateTime(r.returnedAt)}`
              : t('assets.history.notBack')}
          </p>
          {(r.dispatchCondition || r.returnCondition) && (
            <p className="ev-history__cond">
              {r.dispatchCondition && <ConditionBadge condition={r.dispatchCondition} />}
              {r.dispatchCondition && r.returnCondition && <span aria-hidden>→</span>}
              {r.returnCondition && <ConditionBadge condition={r.returnCondition} />}
            </p>
          )}
          {r.returnNote && <p className="ev-history__meta">{r.returnNote}</p>}
        </li>
      ))}
    </ul>
  );
}
