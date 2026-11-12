import { useState } from 'react';
import { mdiChevronLeft, mdiChevronRight } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import {
  getAvailabilityCalendar,
  getMovementCalendar,
  getMovementDay,
  listProducts,
} from '@eventra/api-client';
import { eachDate } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { MovementList } from '@/components/orders/MovementList';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { useResource } from '@/hooks/useResource';
import { formatDate } from '@/lib/format';

type Tab = 'movement' | 'stock';

const pad = (n: number) => String(n).padStart(2, '0');
const monthRange = (year: number, month: number) => {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return { from: `${year}-${pad(month + 1)}-01`, to: `${year}-${pad(month + 1)}-${pad(last)}` };
};

export function CalendarPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const now = new Date();
  const [tab, setTab] = useState<Tab>('movement');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState<string | null>(null);
  const [productId, setProductId] = useState('');

  const { from, to } = monthRange(year, month);
  const todayKey = now.toISOString().slice(0, 10);

  const movement = useResource(() => getMovementCalendar(api, from, to), `m|${from}`);
  const detail = useResource(
    () => (selected ? getMovementDay(api, selected) : Promise.resolve(undefined)),
    `d|${selected ?? ''}`,
  );
  const products = useResource(
    () => (can('product.read') ? listProducts(api, { pageSize: 100 }) : Promise.resolve(undefined)),
    'products',
  );
  const stock = useResource(
    () =>
      tab === 'stock'
        ? getAvailabilityCalendar(api, { from, to, productId: productId || undefined })
        : Promise.resolve(undefined),
    `s|${tab}|${from}|${productId}`,
  );

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(year, month + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth());
    setSelected(null);
  };

  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month, 1)));
  const weekdayLabels = eachDate('2024-01-01', '2024-01-07').map((d) =>
    new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' }).format(new Date(d)),
  );
  // Senin = kolom pertama.
  const lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const byDate = new Map((movement.data ?? []).map((d) => [d.date, d]));

  return (
    <>
      <PageCard>
        <PageHeader title={t('calendar.title')} subtitle={t('calendar.subtitle')}>
          <div className="ev-filters">
            <Button
              size="sm"
              variant="ghost"
              icon={mdiChevronLeft}
              aria-label={t('common.prev')}
              onClick={() => shift(-1)}
            />
            <span className="ev-calendar__month">{monthLabel}</span>
            <Button
              size="sm"
              variant="ghost"
              icon={mdiChevronRight}
              aria-label={t('common.next')}
              onClick={() => shift(1)}
            />
          </div>
        </PageHeader>

        <div role="tablist" className="tabs tabs-box">
          {(['movement', 'stock'] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              className={`tab ${tab === key ? 'tab-active' : ''}`.trim()}
              aria-selected={tab === key}
              onClick={() => setTab(key)}
            >
              {t(`calendar.tabs.${key}`)}
            </button>
          ))}
        </div>

        {tab === 'movement' && (
          <>
            <div className="ev-calendar" role="grid" aria-label={monthLabel}>
              {weekdayLabels.map((label) => (
                <div key={label} className="ev-calendar__weekday" role="columnheader">
                  {label}
                </div>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <div key={`blank-${i}`} className="ev-calendar__blank" />
              ))}
              {eachDate(from, to).map((date) => {
                const day = byDate.get(date);
                const active = (day?.outgoingOrders ?? 0) + (day?.returningOrders ?? 0) > 0;
                return (
                  <button
                    key={date}
                    type="button"
                    className="ev-calendar__day"
                    data-today={date === todayKey}
                    data-selected={date === selected}
                    data-active={active}
                    onClick={() => setSelected(date)}
                  >
                    <span className="ev-calendar__date">{Number(date.slice(8))}</span>
                    {day && day.outgoingUnits > 0 && (
                      <span className="ev-calendar__out">
                        ↑ {day.outgoingOrders} · {day.outgoingUnits}
                      </span>
                    )}
                    {day && day.returningUnits > 0 && (
                      <span className="ev-calendar__in">
                        ↓ {day.returningOrders} · {day.returningUnits}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="ev-hint">{t('calendar.legend')}</p>
            {movement.loading && !movement.data && <Loading />}
          </>
        )}

        {tab === 'stock' && (
          <>
            <SearchSelect
              ariaLabel={t('orders.product')}
              value={productId}
              onChange={setProductId}
              options={[
                { value: '', label: t('common.all') },
                ...(products.data?.items ?? []).map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            {stock.loading && !stock.data ? (
              <Loading />
            ) : (
              <div className="ev-table-wrap">
                <table className="table">
                  <thead className="ev-table__head">
                    <tr>
                      <th>{t('calendar.date')}</th>
                      <th>{t('orders.product')}</th>
                      <th>{t('calendar.total')}</th>
                      <th>{t('calendar.confirmed')}</th>
                      <th>{t('calendar.held')}</th>
                      <th>{t('calendar.remaining')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(stock.data ?? []).map((row) => (
                      <tr key={`${row.productId}|${row.date}`} className="ev-table__row">
                        <td>{formatDate(row.date)}</td>
                        <td>{row.productName}</td>
                        <td>{row.total}</td>
                        <td>{row.confirmed}</td>
                        <td>{row.held}</td>
                        <td>{row.remaining}</td>
                      </tr>
                    ))}
                    {stock.data?.length === 0 && (
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
          </>
        )}
      </PageCard>

      {tab === 'movement' && selected && (
        <PageCard>
          <h2 className="ev-section-title">{formatDate(selected)}</h2>
          {detail.loading && !detail.data ? (
            <Loading />
          ) : (
            <div className="ev-calendar__detail">
              <MovementList
                title={t('calendar.outgoing')}
                movements={detail.data?.outgoing ?? []}
              />
              <MovementList
                title={t('calendar.returning')}
                movements={detail.data?.returning ?? []}
              />
            </div>
          )}
        </PageCard>
      )}
    </>
  );
}
