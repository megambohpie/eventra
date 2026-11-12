import { useState } from 'react';
import { mdiPlus } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { listCustomers } from '@eventra/api-client';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { CustomerModal } from '@/components/customers/CustomerModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { useResource } from '@/hooks/useResource';

const PAGE_SIZE = 20;

export function CustomersPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canWrite = can('customer.write');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  // 'new' membuka form baru; selain itu id pelanggan yang dibuka.
  const [selected, setSelected] = useState<string | 'new' | null>(null);

  const { data, loading, reload } = useResource(
    () => listCustomers(api, { q: q || undefined, page, pageSize: PAGE_SIZE }),
    `${q}|${page}`,
  );
  const current = data?.items.find((c) => c.id === selected);

  return (
    <>
      <PageCard>
        <PageHeader title={t('customers.title')}>
          <SearchInput
            value={q}
            onChange={(value) => {
              setQ(value);
              setPage(1);
            }}
          />
          {canWrite && (
            <Button size="sm" variant="primary" icon={mdiPlus} onClick={() => setSelected('new')}>
              {t('customers.new')}
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
                  <th>{t('customers.name')}</th>
                  <th>{t('customers.type')}</th>
                  <th>{t('customers.phone')}</th>
                  <th>{t('customers.email')}</th>
                  <th>{t('common.status')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data?.items.map((customer) => (
                  <tr key={customer.id} className="ev-table__row">
                    <td>{customer.name}</td>
                    <td>{t(`customers.types.${customer.type}`)}</td>
                    <td>{customer.phone ?? '-'}</td>
                    <td>{customer.email ?? '-'}</td>
                    <td>
                      <Badge variant={customer.active ? 'success' : 'neutral'}>
                        {customer.active ? t('common.active') : t('common.inactive')}
                      </Badge>
                    </td>
                    <td className="ev-table__actions">
                      <Button size="sm" variant="ghost" onClick={() => setSelected(customer.id)}>
                        {canWrite ? t('common.edit') : t('common.view')}
                      </Button>
                    </td>
                  </tr>
                ))}
                {data?.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="ev-table__empty">
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

      {selected === 'new' && (
        <CustomerModal readOnly={false} onClose={() => setSelected(null)} onChanged={reload} />
      )}
      {current && (
        <CustomerModal
          key={current.id}
          customer={current}
          readOnly={!canWrite}
          onClose={() => setSelected(null)}
          onChanged={reload}
        />
      )}
    </>
  );
}
