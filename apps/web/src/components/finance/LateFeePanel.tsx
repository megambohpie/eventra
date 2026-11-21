import { useState } from 'react';
import { mdiShieldCheck } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getOrderLateFees, waiveLateFee } from '@eventra/api-client';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ReasonModal } from '@/components/ui/ReasonModal';
import { useResource } from '@/hooks/useResource';
import { formatDate, formatRupiah } from '@/lib/format';
import { notify } from '@/lib/notifications';

/**
 * Denda keterlambatan pengembalian sebuah pesanan. Tidak tampil bila belum ada denda (kebijakan
 * nonaktif atau barang kembali tepat waktu). Khusus Owner dapat menghapuskan denda dengan alasan.
 */
export function LateFeePanel({ orderId }: { orderId: string }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [waivingId, setWaivingId] = useState<string | null>(null);
  const fees = useResource(() => getOrderLateFees(api, orderId), `late-fees-${orderId}`);
  if (!fees.data || fees.data.length === 0) return null;

  return (
    <>
      {fees.data.map((fee) => (
        <div
          key={fee.id}
          role="alert"
          className={`alert ${fee.status === 'WAIVED' ? 'alert-info' : 'alert-warning'} ev-notice`}
        >
          <div>
            <strong>
              {t('finance.lateFee.title')}: {formatRupiah(fee.amount)}{' '}
              <Badge variant={fee.status === 'WAIVED' ? 'neutral' : 'warning'}>
                {t(`finance.lateFee.status.${fee.status}`)}
              </Badge>
            </strong>
            <p className="ev-hint">
              {t('finance.lateFee.summary', {
                days: fee.chargeableDays,
                late: fee.daysLate,
                grace: fee.graceDays,
                percent: fee.percentPerDay,
                base: formatRupiah(fee.baseAmount),
                date: formatDate(fee.returnedOn),
              })}
            </p>
            {fee.invoiceId && (
              <Link className="ev-link" to={`/invoices/${fee.invoiceId}`}>
                {t('finance.lateFee.viewInvoice')}
              </Link>
            )}
            {fee.status === 'WAIVED' && fee.waiveReason && (
              <p className="ev-hint">
                {t('finance.lateFee.waivedReason', { reason: fee.waiveReason })}
              </p>
            )}
          </div>
          {fee.status === 'ACTIVE' && can('finance.policy') && (
            <Button
              size="sm"
              variant="ghost"
              icon={mdiShieldCheck}
              onClick={() => setWaivingId(fee.id)}
            >
              {t('finance.lateFee.waive')}
            </Button>
          )}
        </div>
      ))}
      {waivingId && (
        <ReasonModal
          title={t('finance.lateFee.waiveTitle')}
          label={t('finance.reason')}
          confirmLabel={t('finance.lateFee.waive')}
          onClose={() => setWaivingId(null)}
          onConfirm={async (reason) => {
            try {
              await waiveLateFee(api, waivingId, { reason });
              notify('success', t('finance.lateFee.waivedDone'));
              setWaivingId(null);
              fees.reload();
            } catch {
              /* error sudah tampil sebagai notifikasi */
            }
          }}
        />
      )}
    </>
  );
}
