import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { listOrderExtensions } from '@eventra/api-client';
import { api } from '@/api';
import { useResource } from '@/hooks/useResource';
import { formatDate, formatDateTime, formatRupiah } from '@/lib/format';

/** Riwayat perpanjangan sewa sebuah pesanan (tidak tampil bila belum pernah diperpanjang). */
export function ExtensionHistory({ orderId, version }: { orderId: string; version: string }) {
  const { t } = useTranslation();
  const list = useResource(() => listOrderExtensions(api, orderId), `ext-${orderId}-${version}`);
  if (!list.data || list.data.length === 0) return null;

  return (
    <section>
      <h2 className="ev-section-title">{t('orders.extend.history')}</h2>
      <div className="ev-table-wrap">
        <table className="table">
          <thead className="ev-table__head">
            <tr>
              <th>{t('orders.extend.when')}</th>
              <th>{t('orders.extend.period')}</th>
              <th>{t('orders.extend.amountCol')}</th>
              <th>{t('orders.extend.invoice')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((e) => (
              <tr key={e.id} className="ev-table__row">
                <td>
                  {formatDateTime(e.createdAt)}
                  {e.createdByName && (
                    <span className="ev-table__hint ev-table__hint--block">{e.createdByName}</span>
                  )}
                </td>
                <td>
                  {formatDate(e.previousEndDate)} → {formatDate(e.newEndDate)} (
                  {t('orders.extend.extraDays', { count: e.extraDays })})
                  {e.note && <span className="ev-table__hint ev-table__hint--block">{e.note}</span>}
                </td>
                <td>{e.amount != null ? formatRupiah(e.amount) : '-'}</td>
                <td>
                  {e.invoiceId ? (
                    <Link className="ev-link" to={`/invoices/${e.invoiceId}`}>
                      {e.invoiceNumber}
                    </Link>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
