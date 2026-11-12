import { useState } from 'react';
import { mdiArrowLeft, mdiBellRing, mdiCancel, mdiCash, mdiCheck, mdiClose } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import {
  confirmPayment,
  getInvoice,
  rejectPayment,
  voidInvoice,
  voidPayment,
} from '@eventra/api-client';
import type { PaymentDto } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { InvoiceStateBadge, PaymentStatusBadge } from '@/components/finance/badges';
import { PaymentModal, ReminderModal } from '@/components/finance/InvoiceModals';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { ReasonModal } from '@/components/ui/ReasonModal';
import { useResource } from '@/hooks/useResource';
import { formatDate, formatDateTime, formatRupiah } from '@/lib/format';
import { notify } from '@/lib/notifications';

type Dialog =
  | { kind: 'pay' | 'remind' | 'voidInvoice' }
  | { kind: 'reject' | 'voidPayment'; payment: PaymentDto }
  | null;

export function InvoiceDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { can } = useAuth();
  const canWrite = can('finance.write');
  const [dialog, setDialog] = useState<Dialog>(null);
  const { data: inv, loading, reload } = useResource(() => getInvoice(api, id), `invoice-${id}`);

  if (loading && !inv) return <Loading />;
  if (!inv) return null;

  const active = inv.status === 'ISSUED';
  const closeDialog = () => setDialog(null);

  const confirm = (payment: PaymentDto) => async () => {
    try {
      await confirmPayment(api, payment.id);
      notify('success', t('finance.confirmed'));
      reload();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  const info: [string, string][] = [
    [t('finance.customer'), inv.customerName],
    [t('finance.dueDate'), formatDate(inv.dueDate)],
    [t('finance.issuedAt'), formatDateTime(inv.issuedAt)],
    [t('finance.rent'), formatRupiah(inv.rentAmount)],
    [t('finance.deposit'), formatRupiah(inv.depositAmount)],
    [t('finance.total'), formatRupiah(inv.total)],
    [t('finance.paid'), formatRupiah(inv.paid)],
    [t('finance.pending'), formatRupiah(inv.pending)],
    [t('finance.outstanding'), formatRupiah(inv.outstanding)],
    [t('finance.note'), inv.note ?? '-'],
  ];

  return (
    <div className="ev-detail">
      <PageCard>
        <PageHeader title={inv.number} subtitle={inv.orderNumber}>
          <Link to="/invoices" className="btn btn-ghost btn-sm">
            <Icon path={mdiArrowLeft} />
            {t('finance.backToList')}
          </Link>
          <Link to={`/orders/${inv.orderId}`} className="btn btn-ghost btn-sm">
            {inv.orderNumber}
          </Link>
        </PageHeader>
        <div className="ev-detail__badges">
          <InvoiceStateBadge state={inv.paymentState} />
          {inv.overdueDays > 0 && (
            <Badge variant="error">{t('finance.overdueBy', { count: inv.overdueDays })}</Badge>
          )}
        </div>
        {inv.voidReason && (
          <p className="ev-hint">{t('finance.voidedBecause', { reason: inv.voidReason })}</p>
        )}

        <dl className="ev-dl">
          {info.map(([label, value]) => (
            <div key={label} className="ev-dl__row">
              <dt className="ev-dl__term">{label}</dt>
              <dd className="ev-dl__desc">{value}</dd>
            </div>
          ))}
        </dl>

        {canWrite && active && (
          <div className="ev-detail__actions">
            <Button
              size="sm"
              variant="primary"
              icon={mdiCash}
              disabled={inv.payableRent + inv.payableDeposit <= 0}
              onClick={() => setDialog({ kind: 'pay' })}
            >
              {t('finance.recordPayment')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={mdiBellRing}
              disabled={inv.outstanding <= 0}
              onClick={() => setDialog({ kind: 'remind' })}
            >
              {t('finance.remind')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={mdiCancel}
              onClick={() => setDialog({ kind: 'voidInvoice' })}
            >
              {t('finance.voidInvoice')}
            </Button>
          </div>
        )}
      </PageCard>

      <PageCard>
        <h2 className="ev-section-title">{t('finance.payments')}</h2>
        <div className="ev-table-wrap">
          <table className="table">
            <thead className="ev-table__head">
              <tr>
                <th>{t('finance.paidAt')}</th>
                <th>{t('finance.purpose')}</th>
                <th>{t('finance.method')}</th>
                <th>{t('finance.amount')}</th>
                <th>{t('common.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {inv.payments.map((p) => (
                <tr key={p.id} className="ev-table__row">
                  <td>
                    {formatDateTime(p.paidAt)}
                    {p.recordedBy && (
                      <span className="ev-table__hint ev-table__hint--block">
                        {t('finance.recordedBy', { name: p.recordedBy })}
                      </span>
                    )}
                  </td>
                  <td>{t(`finance.purposes.${p.purpose}`)}</td>
                  <td>
                    {t(`finance.methods.${p.method}`)}
                    {p.reference && (
                      <span className="ev-table__hint ev-table__hint--block">{p.reference}</span>
                    )}
                  </td>
                  <td>{formatRupiah(p.amount)}</td>
                  <td>
                    <PaymentStatusBadge status={p.status} />
                    {p.late && <Badge variant="warning">{t('finance.late')}</Badge>}
                    {p.voidReason && (
                      <span className="ev-table__hint ev-table__hint--block">{p.voidReason}</span>
                    )}
                  </td>
                  <td className="ev-table__actions">
                    {canWrite && p.status === 'PENDING' && (
                      <>
                        <Button size="xs" variant="success" icon={mdiCheck} onClick={confirm(p)}>
                          {t('finance.confirm')}
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          icon={mdiClose}
                          onClick={() => setDialog({ kind: 'reject', payment: p })}
                        >
                          {t('finance.reject')}
                        </Button>
                      </>
                    )}
                    {canWrite && (p.status === 'PENDING' || p.status === 'SUCCEEDED') && (
                      <Button
                        size="xs"
                        variant="ghost"
                        icon={mdiCancel}
                        onClick={() => setDialog({ kind: 'voidPayment', payment: p })}
                      >
                        {t('finance.voidPayment')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {inv.payments.length === 0 && (
                <tr>
                  <td colSpan={6} className="ev-table__empty">
                    {t('finance.noPayments')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PageCard>

      <PageCard>
        <h2 className="ev-section-title">{t('finance.reminders')}</h2>
        {inv.reminders.length === 0 ? (
          <p className="ev-hint">{t('finance.noReminders')}</p>
        ) : (
          <ul className="ev-timeline">
            {inv.reminders.map((r) => (
              <li key={r.id} className="ev-timeline__item">
                <p className="ev-timeline__title">{t(`finance.reminderKinds.${r.kind}`)}</p>
                {r.note && <p className="ev-timeline__text">{r.note}</p>}
                <p className="ev-table__hint">
                  {formatDateTime(r.createdAt)}
                  {r.createdBy ? ` · ${t('finance.recordedBy', { name: r.createdBy })}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </PageCard>

      {dialog?.kind === 'pay' && (
        <PaymentModal invoice={inv} onClose={closeDialog} onChanged={reload} />
      )}
      {dialog?.kind === 'remind' && (
        <ReminderModal invoice={inv} onClose={closeDialog} onChanged={reload} />
      )}
      {dialog?.kind === 'voidInvoice' && (
        <ReasonModal
          title={t('finance.voidInvoiceTitle')}
          label={t('finance.reason')}
          confirmLabel={t('finance.voidInvoice')}
          onClose={closeDialog}
          onConfirm={async (reason) => {
            try {
              await voidInvoice(api, id, { reason });
              notify('success', t('finance.invoiceVoided'));
              closeDialog();
              reload();
            } catch {
              /* error sudah tampil sebagai notifikasi */
            }
          }}
        />
      )}
      {dialog?.kind === 'reject' && (
        <ReasonModal
          title={t('finance.rejectTitle')}
          label={t('finance.reason')}
          confirmLabel={t('finance.reject')}
          onClose={closeDialog}
          onConfirm={async (reason) => {
            try {
              await rejectPayment(api, dialog.payment.id, { reason });
              notify('success', t('finance.rejected'));
              closeDialog();
              reload();
            } catch {
              /* error sudah tampil sebagai notifikasi */
            }
          }}
        />
      )}
      {dialog?.kind === 'voidPayment' && (
        <ReasonModal
          title={t('finance.voidPaymentTitle')}
          label={t('finance.reason')}
          confirmLabel={t('finance.voidPayment')}
          onClose={closeDialog}
          onConfirm={async (reason) => {
            try {
              await voidPayment(api, dialog.payment.id, { reason });
              notify('success', t('finance.voided'));
              closeDialog();
              reload();
            } catch {
              /* error sudah tampil sebagai notifikasi */
            }
          }}
        />
      )}
    </div>
  );
}
