import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { CalendarMovementDto } from '@eventra/shared';
import { formatDate } from '@/lib/format';
import { OrderStatusBadge } from './OrderStatusBadge';

/** Daftar pesanan yang keluar/kembali pada satu tanggal (pesanan, jumlah, lokasi, PIC). */
export function MovementList({
  title,
  movements,
}: {
  title: string;
  movements: CalendarMovementDto[];
}) {
  const { t } = useTranslation();
  return (
    <section className="ev-calendar__group">
      <h3 className="ev-section-title">
        {title} ({movements.length})
      </h3>
      {movements.length === 0 && <p className="ev-hint">{t('calendar.noMovement')}</p>}
      {movements.map((m) => (
        <article key={m.orderId} className="ev-receipt-item">
          <div className="ev-detail__badges">
            <Link className="ev-link" to={`/orders/${m.orderId}`}>
              {m.orderNumber}
            </Link>
            <OrderStatusBadge status={m.status} />
          </div>
          <p>
            {m.customerName} · {m.eventLocation}
          </p>
          <p className="ev-hint">
            {formatDate(m.startDate)} – {formatDate(m.endDate)}
          </p>
          <ul className="ev-calendar__list">
            {m.items.map((i) => (
              <li key={i.productName}>
                {i.quantity} {i.unitLabel} {i.productName}
              </li>
            ))}
          </ul>
          <p className="ev-hint">
            {t('calendar.physical')}:{' '}
            {m.units.map((u) => `${u.quantity} × ${u.productName}`).join(', ')}
          </p>
          {m.pics.length > 0 && (
            <p className="ev-hint">
              {m.pics.map((p) => `${t(`orders.pics.roles.${p.role}`)}: ${p.name}`).join(' · ')}
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
