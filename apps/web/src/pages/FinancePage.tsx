import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getReceivablesReport, getRevenueReport } from '@eventra/api-client';
import { REVENUE_GROUPS, type RevenueGroup } from '@eventra/shared';
import { api } from '@/api';
import { InvoiceStateBadge } from '@/components/finance/badges';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { StatTile } from '@/components/ui/StatTile';
import { useResource } from '@/hooks/useResource';
import { formatDate, formatRupiah } from '@/lib/format';

const pad = (n: number) => String(n).padStart(2, '0');
const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function FinancePage() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [groupBy, setGroupBy] = useState<RevenueGroup>('day');
  const validRange = from !== '' && to !== '' && from <= to;

  const revenue = useResource(
    () => (validRange ? getRevenueReport(api, { from, to, groupBy }) : Promise.resolve(undefined)),
    `rev|${from}|${to}|${groupBy}`,
  );
  const receivables = useResource(() => getReceivablesReport(api), 'receivables');
  const r = revenue.data;
  const s = receivables.data?.summary;
  const peak = Math.max(1, ...(r?.series.map((p) => p.rentReceived) ?? [0]));

  return (
    <>
      <PageCard>
        <PageHeader title={t('finance.report.title')} subtitle={t('finance.report.subtitle')} />

        {receivables.loading && !s ? (
          <Loading />
        ) : (
          s && (
            <div className="ev-stats">
              <StatTile
                title={t('finance.report.totalOutstanding')}
                value={formatRupiah(s.totalOutstanding)}
                hint={t('finance.report.totalOutstandingHint', { count: s.invoices })}
              />
              <StatTile
                title={t('finance.report.overdue')}
                value={formatRupiah(s.overdueOutstanding)}
                hint={t('finance.report.overdueHint', { count: s.overdueInvoices })}
                alert={s.overdueInvoices > 0}
              />
              <StatTile
                title={t('finance.report.activeValue')}
                value={formatRupiah(s.activeOrderValue)}
                hint={t('finance.report.activeValueHint', { count: s.activeOrders })}
              />
            </div>
          )
        )}
      </PageCard>

      <PageCard>
        <PageHeader title={t('finance.report.revenueTitle')}>
          <div className="ev-filters">
            <label className="ev-filters__field">
              <span className="ev-table__hint">{t('finance.report.from')}</span>
              <input
                type="date"
                className="input input-sm ev-control"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="ev-filters__field">
              <span className="ev-table__hint">{t('finance.report.to')}</span>
              <input
                type="date"
                className="input input-sm ev-control"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <select
              className="select select-sm ev-control ev-select--auto"
              aria-label={t('finance.report.groupBy')}
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as RevenueGroup)}
            >
              {REVENUE_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {t(`finance.report.groups.${g}`)}
                </option>
              ))}
            </select>
          </div>
        </PageHeader>

        {revenue.loading && !r ? (
          <Loading />
        ) : (
          r && (
            <>
              <div className="ev-stats">
                <StatTile
                  title={t('finance.report.rentReceived')}
                  value={formatRupiah(r.rentReceived)}
                  hint={t('finance.report.rentReceivedHint')}
                />
                <StatTile
                  title={t('finance.report.depositReceived')}
                  value={formatRupiah(r.depositReceived)}
                  hint={t('finance.report.depositReceivedHint')}
                />
                <StatTile
                  title={t('finance.report.latePayments')}
                  value={r.latePayments}
                  hint={t('finance.report.latePaymentsHint', {
                    amount: formatRupiah(r.latePaymentsAmount),
                  })}
                  alert={r.latePayments > 0}
                />
              </div>
              <div className="ev-table-wrap">
                <table className="table">
                  <thead className="ev-table__head">
                    <tr>
                      <th>{t('finance.report.period')}</th>
                      <th>{t('finance.report.rentReceived')}</th>
                      <th className="ev-cell--bar" aria-hidden />
                      <th>{t('finance.report.depositReceived')}</th>
                      <th>{t('finance.report.payments')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.series.map((p) => (
                      <tr key={p.period} className="ev-table__row">
                        <td>{p.period}</td>
                        <td>{formatRupiah(p.rentReceived)}</td>
                        <td className="ev-cell--bar">
                          <progress
                            className="progress progress-primary"
                            value={p.rentReceived}
                            max={peak}
                            aria-hidden
                          />
                        </td>
                        <td>{formatRupiah(p.depositReceived)}</td>
                        <td>{p.payments}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}
      </PageCard>

      <PageCard>
        <PageHeader
          title={t('finance.report.receivablesTitle')}
          subtitle={t('finance.report.receivablesHint')}
        />
        {receivables.loading && !receivables.data ? (
          <Loading />
        ) : (
          <div className="ev-table-wrap">
            <table className="table">
              <thead className="ev-table__head">
                <tr>
                  <th>{t('finance.number')}</th>
                  <th>{t('finance.customer')}</th>
                  <th>{t('finance.report.pic')}</th>
                  <th>{t('finance.total')}</th>
                  <th>{t('finance.paid')}</th>
                  <th>{t('finance.outstanding')}</th>
                  <th>{t('finance.dueDate')}</th>
                  <th>{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {receivables.data?.items.map((i) => (
                  <tr key={i.id} className="ev-table__row">
                    <td>
                      <Link className="ev-link" to={`/invoices/${i.id}`}>
                        {i.number}
                      </Link>
                      <span className="ev-table__hint ev-table__hint--block">{i.orderNumber}</span>
                    </td>
                    <td>{i.customerName}</td>
                    <td>
                      {i.pics.length === 0
                        ? '-'
                        : i.pics
                            .map((p) => (p.phone ? `${p.name} (${p.phone})` : p.name))
                            .join(', ')}
                    </td>
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
                  </tr>
                ))}
                {receivables.data?.items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="ev-table__empty">
                      {t('finance.report.noReceivables')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>
    </>
  );
}
