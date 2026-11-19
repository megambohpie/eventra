import { useEffect, useState, type CSSProperties } from 'react';
import { mdiChevronLeft, mdiChevronRight, mdiPlus } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getCalendarOrders } from '@eventra/api-client';
import type { CalendarOrderDto } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { CalendarOrderPopover } from '@/components/orders/CalendarOrderPopover';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { useResource } from '@/hooks/useResource';
import { customerTones, monthRange, monthWeeks, weekBars } from '@/lib/calendar';

interface Hovered {
  order: CalendarOrderDto;
  anchor: DOMRect;
}

/**
 * Kalender pesanan (halaman depan): tiap pesanan menjadi blok panjang dari tanggal mulai sampai
 * selesai dengan warna per pelanggan; kursor di atas blok memunculkan rincian dan jumlah aset,
 * klik blok = detail pesanan, tombol + pada tanggal = pesanan baru di tanggal itu.
 */
export function OrderCalendar() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canWrite = can('order.write');
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [hovered, setHovered] = useState<Hovered | null>(null);

  const { from, to } = monthRange(year, month);
  const orders = useResource(() => getCalendarOrders(api, from, to), `co|${from}`);

  // Popover memakai posisi layar saat hover; tutup bila halaman digulir agar tidak basi.
  useEffect(() => {
    if (!hovered) return;
    const close = () => setHovered(null);
    window.addEventListener('scroll', close, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', close, { capture: true });
  }, [hovered]);

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(year, month + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth());
  };
  const goToday = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth());
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
  // Setiap pelanggan mendapat warna sendiri (hue) pada bulan yang tampil.
  const tones = customerTones(orders.data ?? []);
  const hueOf = (customerId: string) => tones.get(customerId)?.hue ?? 250;

  return (
    <PageCard>
      <PageHeader title={t('calendar.title')} subtitle={t('calendar.frontSubtitle')}>
        <div className="ev-filters">
          <Button size="sm" variant="ghost" onClick={goToday}>
            {t('calendar.today')}
          </Button>
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
      {orders.data && (
        <p className="ev-calendar__summary">
          {t('calendar.summary', { orders: orders.data.length, customers: tones.size })}
        </p>
      )}

      <div className="ev-calendar" aria-label={monthLabel}>
        <div className="ev-calendar__weekdays" aria-hidden="true">
          {weekdayLabels.map((label, i) => (
            <div key={label} className="ev-calendar__weekday" data-weekend={i >= 5}>
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
                  data-weekend={i >= 5}
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
            {weekBars(week, orders.data ?? []).map((bar) => {
              const show = (el: HTMLElement) =>
                setHovered({ order: bar.order, anchor: el.getBoundingClientRect() });
              return (
                <Link
                  key={`${bar.order.orderId}|${bar.col}`}
                  to={`/orders/${bar.order.orderId}`}
                  className="ev-calendar__bar"
                  data-status={bar.order.status}
                  data-col={bar.col}
                  data-span={bar.span}
                  data-before={bar.continuesBefore}
                  data-after={bar.continuesAfter}
                  style={{ '--ev-hue': hueOf(bar.order.customerId) } as CSSProperties}
                  aria-label={`${bar.order.orderNumber} · ${bar.order.customerName} · ${t(`orders.statuses.${bar.order.status}`)} · ${t('calendar.assetCount', { count: bar.order.assetCount })}`}
                  onMouseEnter={(e) => show(e.currentTarget)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={(e) => show(e.currentTarget)}
                  onBlur={() => setHovered(null)}
                >
                  <span className="ev-calendar__bar-name">{bar.order.customerName}</span>
                  {bar.span >= 2 && bar.order.assetCount > 0 && (
                    <span className="ev-calendar__bar-count">
                      {t('calendar.assetCount', { count: bar.order.assetCount })}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      {tones.size > 0 && (
        <ul className="ev-calendar__legend" aria-label={t('calendar.customers')}>
          {[...tones.values()].map((tone) => (
            <li key={tone.customerId} className="ev-calendar__legend-item">
              <span
                className="ev-calendar__swatch"
                style={{ '--ev-hue': tone.hue } as CSSProperties}
                aria-hidden="true"
              />
              {tone.customerName}
            </li>
          ))}
        </ul>
      )}
      <p className="ev-hint">{t('calendar.frontLegend')}</p>
      {orders.loading && !orders.data && <Loading />}
      {hovered && (
        <CalendarOrderPopover
          order={hovered.order}
          anchor={hovered.anchor}
          hue={hueOf(hovered.order.customerId)}
        />
      )}
    </PageCard>
  );
}
