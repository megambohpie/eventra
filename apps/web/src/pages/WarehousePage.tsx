import { useState } from 'react';
import { mdiPlus } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createPickList, listPickLists, listPickableOrders } from '@eventra/api-client';
import { PICK_LIST_STATUSES, type PickListStatus } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { PickListStatusBadge } from '@/components/warehouse/badges';
import { useResource } from '@/hooks/useResource';
import { formatDate } from '@/lib/format';

const PAGE_SIZE = 20;

export function WarehousePage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const canWrite = can('warehouse.write');
  const [params] = useSearchParams();

  const [q, setQ] = useState(params.get('q') ?? '');
  const [status, setStatus] = useState<PickListStatus | ''>('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [orderId, setOrderId] = useState('');

  const { data, loading } = useResource(
    () =>
      listPickLists(api, {
        q: q || undefined,
        status: status || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    `${q}|${status}|${page}`,
  );
  const eligible = useResource(
    () => (creating ? listPickableOrders(api) : Promise.resolve(undefined)),
    `eligible-${creating}`,
  );

  const create = async () => {
    if (!orderId) return;
    try {
      const pick = await createPickList(api, orderId);
      navigate(`/warehouse/pick-lists/${pick.id}`);
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  return (
    <>
      <PageCard>
        <PageHeader title={t('warehouse.title')} subtitle={t('warehouse.subtitle')}>
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
              setStatus(e.target.value as PickListStatus | '');
              setPage(1);
            }}
          >
            <option value="">
              {t('common.status')}: {t('common.all')}
            </option>
            {PICK_LIST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`warehouse.statuses.${s}`)}
              </option>
            ))}
          </select>
          {canWrite && (
            <Button size="sm" variant="primary" icon={mdiPlus} onClick={() => setCreating(true)}>
              {t('warehouse.new')}
            </Button>
          )}
        </PageHeader>

        {loading && !data ? (
          <Loading />
        ) : (
          <div className="ev-table-wrap">
            <table className="table">
              <thead className="ev-table__head">
                <tr>
                  <th>{t('warehouse.number')}</th>
                  <th>{t('warehouse.orderNumber')}</th>
                  <th>{t('warehouse.customer')}</th>
                  <th>{t('warehouse.period')}</th>
                  <th>{t('warehouse.progress')}</th>
                  <th>{t('common.status')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data?.items.map((p) => (
                  <tr key={p.id} className="ev-table__row">
                    <td>
                      <Link className="ev-link" to={`/warehouse/pick-lists/${p.id}`}>
                        {p.number}
                      </Link>
                    </td>
                    <td>{p.orderNumber}</td>
                    <td>{p.customerName}</td>
                    <td>
                      {formatDate(p.startDate)} – {formatDate(p.endDate)}
                    </td>
                    <td>
                      {p.verified} / {p.required}
                    </td>
                    <td>
                      <PickListStatusBadge status={p.status} />
                    </td>
                    <td className="ev-table__actions">
                      <Link className="btn btn-ghost btn-sm" to={`/warehouse/pick-lists/${p.id}`}>
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

      <Modal
        open={creating}
        title={t('warehouse.newTitle')}
        onClose={() => {
          setCreating(false);
          setOrderId('');
        }}
      >
        {eligible.data && eligible.data.length === 0 ? (
          <p>{t('warehouse.noEligible')}</p>
        ) : (
          <FormField label={t('warehouse.order')}>
            <SearchSelect
              ariaLabel={t('warehouse.order')}
              value={orderId}
              onChange={setOrderId}
              options={(eligible.data ?? []).map((o) => ({
                value: o.id,
                label: `${o.number} · ${o.customerName} · ${formatDate(o.startDate)}`,
              }))}
            />
          </FormField>
        )}
        <div className="modal-action">
          <Button variant="primary" icon={mdiPlus} disabled={!orderId} onClick={create}>
            {t('warehouse.new')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
