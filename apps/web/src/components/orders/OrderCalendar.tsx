import { useState } from 'react';
import { mdiChevronLeft, mdiChevronRight, mdiPlus } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getCalendarOrders } from '@eventra/api-client';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { useResource } from '@/hooks/useResource';
import { monthRange, monthWeeks, weekBars } from '@/lib/calendar';

/**
 * Kalender pesanan (halaman depan): tiap pesanan menjadi blok panjang dari tanggal mulai sampai
 * selesai; klik blok = detail pesanan, tombol + pada tanggal = pesanan baru di tanggal itu.
 */
export function OrderCalendar() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canWrite = can('order.write');
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const { from, to } = monthRange(year, month);
  const orders = useResource(() => getCalendarOrders(api, from, to), `co|${from}`);

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(year, month + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth());
  };

  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month, 1)));
  // 2024-01-01 adalah Senin.
  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2024, 0, 1 + i)),
    ),
  );
  const weeks = monthWeeks(year, month);

  return (
    <PageCard>
      <PageHeader title={t('calendar.title')} subtitle={t('calendar.frontSubtitle')}>
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

      <div className="ev-calendar" aria-label={monthLabel}>
        <div className="ev-calendar__weekdays" aria-hidden="true">
          {weekdayLabels.map((label) => (
            <div key={label} className="ev-calendar__weekday">
              {label}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week.find(Boolean) ?? 'w'} className="ev-calendar__week">
            {week.map((date, i) =>
              date ? (
                <div
                  key={date}
                  className="ev-calendar__cell"
                  data-today={date === todayKey}
                  data-past={date < todayKey}
                >
                  <span className="ev-calendar__date">{Number(date.slice(8))}</span>
                  {canWrite && date >= todayKey && (
                    <Link
                      to={`/orders/new?start=${date}`}
                      className="btn btn-ghost btn-xs btn-circle ev-calendar__add"
                      aria-label={t('calendar.addOrderOn', { date })}
                      title={t('orders.new')}
                    >
                      <Icon path={mdiPlus} />
                    </Link>
                  )}
                </div>
              ) : (
                <div key={`blank-${i}`} className="ev-calendar__cell" data-blank="true" />
              ),
            )}
            {weekBars(week, orders.data ?? []).map((bar) => (
              <Link
                key={`${bar.order.orderId}|${bar.col}`}
                to={`/orders/${bar.order.orderId}`}
                className="ev-calendar__bar"
                data-status={bar.order.status}
                data-col={bar.col}
                data-span={bar.span}
                data-before={bar.continuesBefore}
                data-after={bar.continuesAfter}
                title={`${bar.order.orderNumber} · ${bar.order.customerName} · ${t(`orders.statuses.${bar.order.status}`)}`}
              >
                {bar.order.customerName}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <p className="ev-hint">{t('calendar.frontLegend')}</p>
      {orders.loading && !orders.data && <Loading />}
    </PageCard>
  );
}
