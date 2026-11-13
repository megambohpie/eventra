import { useState } from 'react';
import { mdiCancel, mdiCheckCircle, mdiPencil, mdiPlus, mdiSend } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import {
  cancelOrder,
  confirmOrder,
  deleteOrderPic,
  getOrder,
  listUsers,
  submitOrder,
} from '@eventra/api-client';
import { PIC_ROLES, SINGLE_PIC_ROLES, type OrderDto, type OrderPicDto } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { OrderNoteModal } from '@/components/orders/OrderNoteModal';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { PicModal } from '@/components/orders/PicModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LocationView } from '@/components/ui/LocationPicker';
import { Icon } from '@/components/ui/Icon';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { useResource } from '@/hooks/useResource';
import { formatDate, formatDateTime, formatRupiah } from '@/lib/format';
import { notify } from '@/lib/notifications';

type Dialog = 'cancel' | { kind: 'pic'; pic?: OrderPicDto } | null;

const PIC_LOCKED = ['COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED'];

export function OrderDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { can } = useAuth();
  const canWrite = can('order.write');
  const canApprove = can('order.approve');
  const [dialog, setDialog] = useState<Dialog>(null);

  const { data: order, loading, reload } = useResource(() => getOrder(api, id), id);
  const users = useResource(
    () => (can('user.read') ? listUsers(api, { pageSize: 100 }) : Promise.resolve(undefined)),
    'users',
  );

  if (loading && !order) return <Loading />;
  if (!order) {
    return (
      <PageCard>
        <p>{t('common.empty')}</p>
        <Link className="btn btn-ghost btn-sm" to="/orders">
          {t('common.back')}
        </Link>
      </PageCard>
    );
  }

  /** Jalankan aksi status; error sudah dinotifikasi oleh client Axios. */
  const run =
    (action: () => Promise<OrderDto>, doneKey = 'orders.updated') =>
    async () => {
      try {
        await action();
        notify('success', t(doneKey));
        reload();
      } catch {
        /* error sudah tampil sebagai notifikasi */
      }
    };

  const removePic = (pic: OrderPicDto) => async () => {
    try {
      await deleteOrderPic(api, order.id, pic.id);
      notify('success', t('common.deleted'));
      reload();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  const s = order.status;
  const takenRoles = order.pics.filter((p) => SINGLE_PIC_ROLES.includes(p.role)).map((p) => p.role);
  const picEditable = canWrite && !PIC_LOCKED.includes(s);
  const closeDialog = () => setDialog(null);

  return (
    <>
      <PageCard>
        <PageHeader title={order.number} subtitle={order.customerName}>
          <Link className="btn btn-ghost btn-sm" to="/orders">
            {t('common.back')}
          </Link>
        </PageHeader>

        <div className="ev-detail__badges">
          <OrderStatusBadge status={s} />
          {s === 'AWAITING_PAYMENT' && order.holdExpiresAt && (
            <Badge variant="warning">
              {t('orders.holdUntil', { time: formatDateTime(order.holdExpiresAt) })}
            </Badge>
          )}
        </div>

        <div className="ev-detail__actions">
          {canWrite && s === 'DRAFT' && (
            <>
              <Link className="btn btn-secondary btn-sm" to={`/orders/${order.id}/edit`}>
                <Icon path={mdiPencil} />
                {t('common.edit')}
              </Link>
              <Button
                size="sm"
                variant="primary"
                icon={mdiSend}
                onClick={run(() => submitOrder(api, order.id), 'orders.submitted')}
              >
                {t('orders.actions.submit')}
              </Button>
            </>
          )}
          {canApprove && (s === 'PENDING_REVIEW' || s === 'QUOTED' || s === 'AWAITING_PAYMENT') && (
            <Button
              size="sm"
              variant="success"
              icon={mdiCheckCircle}
              onClick={run(() => confirmOrder(api, order.id), 'orders.confirmed')}
            >
              {t('orders.actions.confirm')}
            </Button>
          )}
          {can('warehouse.read') &&
            ['CONFIRMED', 'SCHEDULED', 'IN_PROGRESS', 'ISSUE', 'COMPLETED'].includes(s) && (
              <Link className="btn btn-secondary btn-sm" to={`/warehouse?q=${order.number}`}>
                {t('orders.actions.warehouse')}
              </Link>
            )}
          {canWrite &&
            [
              'DRAFT',
              'PENDING_REVIEW',
              'QUOTED',
              'AWAITING_PAYMENT',
              'CONFIRMED',
              'SCHEDULED',
            ].includes(s) &&
            (canApprove || ['DRAFT', 'PENDING_REVIEW', 'QUOTED'].includes(s)) && (
              <Button
                size="sm"
                variant="ghost"
                icon={mdiCancel}
                onClick={() => setDialog('cancel')}
              >
                {t('orders.actions.cancel')}
              </Button>
            )}
        </div>

        <dl className="ev-dl">
          <div className="ev-dl__row">
            <dt className="ev-dl__term">{t('orders.period')}</dt>
            <dd className="ev-dl__desc">
              {formatDate(order.startDate)} – {formatDate(order.endDate)} (
              {t('orders.days', { count: order.days })})
            </dd>
          </div>
          <div className="ev-dl__row">
            <dt className="ev-dl__term">{t('orders.eventLocation')}</dt>
            <dd className="ev-dl__desc">{order.eventLocation}</dd>
          </div>
          {order.eventAddress && (
            <div className="ev-dl__row">
              <dt className="ev-dl__term">{t('orders.eventAddress')}</dt>
              <dd className="ev-dl__desc">{order.eventAddress}</dd>
            </div>
          )}
          {order.eventLat != null && order.eventLng != null && (
            <div className="ev-dl__row">
              <dt className="ev-dl__term">{t('orders.map.point')}</dt>
              <dd className="ev-dl__desc">
                <LocationView
                  point={{ lat: order.eventLat, lng: order.eventLng }}
                  address={order.eventAddress}
                />
              </dd>
            </div>
          )}
          <div className="ev-dl__row">
            <dt className="ev-dl__term">{t('orders.subtotal')}</dt>
            <dd className="ev-dl__desc">{formatRupiah(order.subtotal)}</dd>
          </div>
          <div className="ev-dl__row">
            <dt className="ev-dl__term">{t('orders.deposit')}</dt>
            <dd className="ev-dl__desc">{formatRupiah(order.depositTotal)}</dd>
          </div>
          {order.note && (
            <div className="ev-dl__row">
              <dt className="ev-dl__term">{t('common.note')}</dt>
              <dd className="ev-dl__desc">{order.note}</dd>
            </div>
          )}
        </dl>

        <h2 className="ev-section-title">{t('orders.items')}</h2>
        <div className="ev-table-wrap">
          <table className="table">
            <thead className="ev-table__head">
              <tr>
                <th>{t('orders.product')}</th>
                <th>{t('orders.quantity')}</th>
                <th>{t('orders.unitPrice')}</th>
                <th>{t('orders.lineTotal')}</th>
                <th>{t('orders.physicalUnits')}</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="ev-table__row">
                  <td>{item.productName}</td>
                  <td>
                    {item.quantity} {item.unitLabel}
                  </td>
                  <td>{formatRupiah(item.unitPrice)}</td>
                  <td>{formatRupiah(item.lineTotal)}</td>
                  <td>
                    {item.components.map((c) => (
                      <div key={c.productId}>
                        {c.required} × {c.productName}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageCard>

      <PageCard>
        <PageHeader title={t('orders.pics.title')} subtitle={t('orders.pics.subtitle')}>
          {picEditable && (
            <Button
              size="sm"
              variant="primary"
              icon={mdiPlus}
              onClick={() => setDialog({ kind: 'pic' })}
            >
              {t('orders.pics.add')}
            </Button>
          )}
        </PageHeader>
        <div className="ev-table-wrap">
          <table className="table">
            <thead className="ev-table__head">
              <tr>
                <th>{t('orders.pics.role')}</th>
                <th>{t('orders.pics.name')}</th>
                <th>{t('orders.pics.phone')}</th>
                <th>{t('orders.pics.source')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {PIC_ROLES.flatMap((role) => order.pics.filter((p) => p.role === role)).map((pic) => (
                <tr key={pic.id} className="ev-table__row">
                  <td>{t(`orders.pics.roles.${pic.role}`)}</td>
                  <td>
                    {pic.name}
                    {pic.organization && <span className="ev-table__hint">{pic.organization}</span>}
                  </td>
                  <td>{pic.phone ?? '-'}</td>
                  <td>
                    {t(`orders.pics.sources.${pic.source}`)}
                    {pic.approvedBy && (
                      <span className="ev-table__hint">
                        {t('orders.pics.approvedBy', { name: pic.approvedBy })}
                      </span>
                    )}
                  </td>
                  <td className="ev-table__actions">
                    {picEditable && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDialog({ kind: 'pic', pic })}
                        >
                          {t('common.edit')}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={removePic(pic)}>
                          {t('common.remove')}
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {order.pics.length === 0 && (
                <tr>
                  <td colSpan={5} className="ev-table__empty">
                    {t('common.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PageCard>

      <PageCard>
        <h2 className="ev-section-title">{t('orders.history')}</h2>
        <ol className="ev-timeline">
          {[...order.history].reverse().map((event) => (
            <li key={event.id} className="ev-timeline__item">
              <p className="ev-timeline__title">
                {event.fromStatus
                  ? t('orders.statusChange', {
                      from: t(`orders.statuses.${event.fromStatus}`),
                      to: t(`orders.statuses.${event.toStatus}`),
                    })
                  : t(`orders.statuses.${event.toStatus}`)}
              </p>
              <p className="ev-timeline__text">
                {formatDateTime(event.createdAt)} · {event.actor ?? t('orders.system')}
                {event.note && ` · ${event.note}`}
              </p>
            </li>
          ))}
        </ol>
        {order.quotes.length > 0 && (
          <>
            <h2 className="ev-section-title">{t('orders.quotes')}</h2>
            <div className="ev-table-wrap">
              <table className="table">
                <thead className="ev-table__head">
                  <tr>
                    <th>{t('orders.version')}</th>
                    <th>{t('orders.subtotal')}</th>
                    <th>{t('orders.deposit')}</th>
                    <th>{t('orders.createdAt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {order.quotes.map((q) => (
                    <tr key={q.id} className="ev-table__row">
                      <td>v{q.version}</td>
                      <td>{formatRupiah(q.subtotal)}</td>
                      <td>{formatRupiah(q.depositTotal)}</td>
                      <td>
                        {formatDateTime(q.createdAt)}
                        {q.createdBy && <span className="ev-table__hint">{q.createdBy}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </PageCard>

      {dialog === 'cancel' && (
        <OrderNoteModal
          title={t('orders.actions.cancel')}
          confirmLabel={t('orders.actions.cancel')}
          onClose={closeDialog}
          onConfirm={async ({ note }) => {
            await run(() => cancelOrder(api, order.id, { note }))();
            closeDialog();
          }}
        />
      )}
      {typeof dialog === 'object' && dialog?.kind === 'pic' && (
        <PicModal
          key={dialog.pic?.id ?? 'new'}
          orderId={order.id}
          pic={dialog.pic}
          takenRoles={takenRoles}
          users={users.data?.items ?? []}
          onClose={closeDialog}
          onChanged={reload}
        />
      )}
    </>
  );
}
