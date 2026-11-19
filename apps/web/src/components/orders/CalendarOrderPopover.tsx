import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { mdiCalendarRange, mdiMapMarker } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { rentalDays, type CalendarOrderDto } from '@eventra/shared';
import { Icon } from '@/components/ui/Icon';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { formatDate } from '@/lib/format';

const MAX_LINES = 6;
const MARGIN = 8;

interface CalendarOrderPopoverProps {
  order: CalendarOrderDto;
  /** Posisi blok pesanan di layar; popover ditempatkan di bawahnya (atau di atas bila tidak muat). */
  anchor: DOMRect;
  hue: number;
}

/** Rincian pesanan saat kursor di atas blok kalender: periode, lokasi, jumlah aset, dan isinya. */
export function CalendarOrderPopover({ order, anchor, hue }: CalendarOrderPopoverProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.min(Math.max(MARGIN, anchor.left), window.innerWidth - width - MARGIN);
    const below = anchor.bottom + MARGIN;
    const top =
      below + height > window.innerHeight - MARGIN
        ? Math.max(MARGIN, anchor.top - height - MARGIN)
        : below;
    setPos({ top, left });
  }, [anchor, order.orderId]);

  const days = rentalDays(order.startDate, order.endDate);
  const shown = order.lines.slice(0, MAX_LINES);
  const hidden = order.lines.length - shown.length;
  const style: CSSProperties = pos
    ? { top: pos.top, left: pos.left }
    : { top: 0, left: 0, visibility: 'hidden' };

  return (
    <div ref={ref} className="ev-calendar__pop" role="tooltip" style={style}>
      <div className="ev-calendar__pop-head">
        <span className="ev-calendar__pop-title">
          <span
            className="ev-calendar__swatch"
            style={{ '--ev-hue': hue } as CSSProperties}
            aria-hidden="true"
          />
          <span className="truncate">{order.customerName}</span>
        </span>
        <OrderStatusBadge status={order.status} />
      </div>
      <div className="ev-calendar__pop-meta">
        <span className="ev-calendar__pop-row">
          <Icon path={mdiCalendarRange} />
          <span>
            {order.orderNumber} · {formatDate(order.startDate)} – {formatDate(order.endDate)} (
            {t('orders.days', { count: days })})
          </span>
        </span>
        {order.eventLocation && (
          <span className="ev-calendar__pop-row">
            <Icon path={mdiMapMarker} />
            <span>{order.eventLocation}</span>
          </span>
        )}
      </div>
      <div className="ev-calendar__pop-assets">
        <div className="ev-calendar__pop-count">
          {order.assetCount}
          <span className="text-xs font-medium">{t('calendar.pop.assets')}</span>
        </div>
        {shown.length > 0 && (
          <ul className="ev-calendar__pop-lines">
            {shown.map((line) => (
              <li key={line.productName} className="ev-calendar__pop-line">
                <span className="min-w-0 break-words">{line.productName}</span>
                <span className="shrink-0 font-semibold">
                  {line.kind === 'AREA'
                    ? `${Number(line.quantity.toFixed(2))} m²`
                    : `× ${line.quantity}`}
                </span>
              </li>
            ))}
            {hidden > 0 && (
              <li className="ev-table__hint">{t('calendar.pop.more', { count: hidden })}</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
