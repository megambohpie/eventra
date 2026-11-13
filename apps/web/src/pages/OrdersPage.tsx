import { useState } from 'react';
import { mdiPlus } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { listOrders } from '@eventra/api-client';
import { ORDER_STATUSES, type OrderStatus } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { Icon } from '@/components/ui/Icon';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { useResource } from '@/hooks/useResource';
import { formatDate, formatRupiah } from '@/lib/format';

const PAGE_SIZE = 20;

export function OrdersPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canWrite = can('order.write');

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [page, setPage] = useState(1);

  const { data, loading } = useResource(
    () =>
      listOrders(api, {
        q: q || undefined,
        status: status || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    `${q}|${status}|${page}`,
  );

  return (
    <PageCard>
      <PageHeader title={t('orders.title')} subtitle={t('orders.subtitle')}>
        <SearchInput
          value={q}
          onChange={(value) => {
            setQ(value);
            setPage(1);
          }}
        />
        <select
          className="select select-sm ev-control ev-select--auto"
          aria-label={t('common.status')}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as OrderStatus | '');
            setPage(1);
          }}
        >
          <option value="">
            {t('common.status')}: {t('common.all')}
          </option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`orders.statuses.${s}`)}
            </option>
          ))}
        </select>
        {canWrite && (
          <Link className="btn btn-primary btn-sm" to="/orders/new">
            <Icon path={mdiPlus} />
            {t('orders.new')}
          </Link>
        )}
      </PageHeader>

      {loading && !data ? (
        <Loading />
      ) : (
        <div className="ev-table-wrap">
          <table className="table">
            <thead className="ev-table__head">
              <tr>
                <th>{t('orders.number')}</th>
                <th>{t('orders.customer')}</th>
                <th>{t('orders.period')}</th>
                <th>{t('orders.eventLocation')}</th>
                <th>{t('orders.subtotal')}</th>
                <th>{t('common.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.items.map((order) => (
                <tr key={order.id} className="ev-table__row">
                  <td>{order.number}</td>
                  <td>{order.customerName}</td>
                  <td>
                    {formatDate(order.startDate)}
                    {order.endDate !== order.startDate && ` – ${formatDate(order.endDate)}`}
                  </td>
                  <td>{order.eventLocation}</td>
                  <td>{formatRupiah(order.subtotal)}</td>
                  <td>
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="ev-table__actions">
                    <Link className="btn btn-ghost btn-sm" to={`/orders/${order.id}`}>
                      {t('common.details')}
                    </Link>
                  </td>
                </tr>
              ))}
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="ev-table__empty">
                    {t('common.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {data && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
      )}
    </PageCard>
  );
}
