import { useState } from 'react';
import { mdiCashPlus, mdiShieldCheck } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getOrderDp, listInvoices, waiveOrderDp } from '@eventra/api-client';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { PaymentModal } from '@/components/finance/InvoiceModals';
import { Button } from '@/components/ui/Button';
import { ReasonModal } from '@/components/ui/ReasonModal';
import { useResource } from '@/hooks/useResource';
import { formatRupiah } from '@/lib/format';
import { notify } from '@/lib/notifications';

/**
 * Syarat DP sebuah pesanan (barang baru boleh keluar gudang setelah DP minimum diterima). Menampilkan
 * kekurangan, tombol bayar, dan, khusus Owner, izin mengeluarkan barang tanpa DP.
 */
export function DpPanel({ orderId }: { orderId: string }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [paying, setPaying] = useState(false);
  const [waiving, setWaiving] = useState(false);

  const dp = useResource(() => getOrderDp(api, orderId), `dp-${orderId}`);
  const invoices = useResource(
    () => listInvoices(api, { orderId, pageSize: 100 }),
    `dp-invoices-${orderId}`,
  );
  const invoice = invoices.data?.items.find((i) => i.status === 'ISSUED');
  const status = dp.data;
  if (!status || status.rentAmount <= 0 || status.percent <= 0) return null;

  const reload = () => {
    dp.reload();
    invoices.reload();
  };
  const tone = status.met ? 'alert-success' : status.waived ? 'alert-info' : 'alert-warning';

  return (
    <>
      <div role="alert" className={`alert ${tone} ev-notice`}>
        <div>
          <strong>
            {status.met
              ? t('finance.dp.met')
              : status.waived
                ? t('finance.dp.waived')
                : t('finance.dp.required')}
          </strong>
          <p className="ev-hint">
            {t('finance.dp.summary', {
              percent: status.percent,
              required: formatRupiah(status.required),
              paid: formatRupiah(status.paid),
            })}
            {!status.met &&
              ` ${t('finance.dp.shortfall', { amount: formatRupiah(status.shortfall) })}`}
          </p>
          {status.waived && status.waivedReason && (
            <p className="ev-hint">
              {t('finance.dp.waivedReason', { reason: status.waivedReason })}
            </p>
          )}
          {!status.met && !invoice && can('finance.write') && (
            <p className="ev-hint">
              <Link className="ev-link" to="/invoices">
                {t('finance.dp.noInvoice')}
              </Link>
            </p>
          )}
        </div>
        {!status.met && (
          <div className="ev-detail__actions">
            {can('finance.write') && invoice && invoice.payableRent > 0 && (
              <Button
                size="sm"
                variant="primary"
                icon={mdiCashPlus}
                onClick={() => setPaying(true)}
              >
                {t('finance.dp.pay')}
              </Button>
            )}
            {can('finance.policy') && !status.waived && (
              <Button
                size="sm"
                variant="ghost"
                icon={mdiShieldCheck}
                onClick={() => setWaiving(true)}
              >
                {t('finance.dp.waive')}
              </Button>
            )}
          </div>
        )}
      </div>

      {paying && invoice && (
        <PaymentModal
          invoice={invoice}
          defaultAmount={Math.min(status.shortfall, invoice.payableRent)}
          onClose={() => setPaying(false)}
          onChanged={reload}
        />
      )}
      {waiving && (
        <ReasonModal
          title={t('finance.dp.waiveTitle')}
          label={t('finance.reason')}
          confirmLabel={t('finance.dp.waive')}
          onClose={() => setWaiving(false)}
          onConfirm={async (reason) => {
            try {
              await waiveOrderDp(api, orderId, { reason });
              notify('success', t('finance.dp.waivedDone'));
              setWaiving(false);
              reload();
            } catch {
              /* error sudah tampil sebagai notifikasi */
            }
          }}
        />
      )}
    </>
  );
}
