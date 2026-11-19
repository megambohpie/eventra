import { useState } from 'react';
import { mdiCashPlus, mdiPlus } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { listInvoices } from '@eventra/api-client';
import {
  INVOICE_PAYMENT_STATES,
  type InvoicePaymentState,
  type InvoiceSummaryDto,
} from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { InvoiceStateBadge } from '@/components/finance/badges';
import { DpPolicy } from '@/components/finance/DpPolicy';
import { InvoiceCreateModal, PaymentModal } from '@/components/finance/InvoiceModals';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { useResource } from '@/hooks/useResource';
import { formatDate, formatRupiah } from '@/lib/format';

const PAGE_SIZE = 20;

export function InvoicesPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canWrite = can('finance.write');
  const [q, setQ] = useState('');
  const [state, setState] = useState<InvoicePaymentState | ''>('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<InvoiceSummaryDto | null>(null);

  const { data, loading, reload } = useResource(
    () =>
      listInvoices(api, {
        q: q || undefined,
        state: state || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    `${q}|${state}|${page}`,
  );

  return (
    <>
      <PageCard>
        <PageHeader title={t('finance.title')} subtitle={t('finance.subtitle')}>
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
            value={state}
            onChange={(e) => {
              setState(e.target.value as InvoicePaymentState | '');
              setPage(1);
            }}
          >
            <option value="">{t('finance.allStates')}</option>
            {INVOICE_PAYMENT_STATES.map((s) => (
              <option key={s} value={s}>
                {t(`finance.states.${s}`)}
              </option>
            ))}
          </select>
          <DpPolicy />
          {canWrite && (
            <Button size="sm" variant="primary" icon={mdiPlus} onClick={() => setCreating(true)}>
              {t('finance.newInvoice')}
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
                  <th>{t('finance.number')}</th>
                  <th>{t('finance.orderNumber')}</th>
                  <th>{t('finance.customer')}</th>
                  <th>{t('finance.total')}</th>
                  <th>{t('finance.paid')}</th>
                  <th>{t('finance.outstanding')}</th>
                  <th>{t('finance.dueDate')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('finance.actionsCol')}</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((i) => (
                  <tr key={i.id} className="ev-table__row">
                    <td>
                      <Link className="ev-link" to={`/invoices/${i.id}`}>
                        {i.number}
                      </Link>
                    </td>
                    <td>
                      <Link className="ev-link" to={`/orders/${i.orderId}`}>
                        {i.orderNumber}
                      </Link>
                    </td>
                    <td>{i.customerName}</td>
                    <td>{formatRupiah(i.total)}</td>
                    <td>{formatRupiah(i.paid)}</td>
                    <td>{formatRupiah(i.outstanding)}</td>
                    <td>
                      {formatDate(i.dueDate)}
                      {i.overdueDays > 0 && (
                        <span className="ev-table__hint ev-table__hint--block">
                          {t('finance.overdueBy', { count: i.overdueDays })}
                        </span>
                      )}
                    </td>
                    <td>
                      <InvoiceStateBadge state={i.paymentState} />
                    </td>
                    <td>
                      {canWrite &&
                        i.status === 'ISSUED' &&
                        i.payableRent + i.payableDeposit > 0 && (
                          <Button
                            size="sm"
                            variant="primary"
                            icon={mdiCashPlus}
                            onClick={() => setPaying(i)}
                          >
                            {t('finance.pay')}
                          </Button>
                        )}
                    </td>
                  </tr>
                ))}
                {data?.items.length === 0 && (
                  <tr>
                    <td colSpan={9} className="ev-table__empty">
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

      {creating && <InvoiceCreateModal onClose={() => setCreating(false)} onChanged={reload} />}
      {paying && (
        <PaymentModal invoice={paying} onClose={() => setPaying(null)} onChanged={reload} />
      )}
    </>
  );
}
