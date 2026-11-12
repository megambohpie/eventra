import { useTranslation } from 'react-i18next';
import {
  INVOICE_STATE_BADGE,
  PAYMENT_STATUS_BADGE,
  type InvoicePaymentState,
  type PaymentStatus,
} from '@eventra/shared';
import { Badge } from '@/components/ui/Badge';

export function InvoiceStateBadge({ state }: { state: InvoicePaymentState }) {
  const { t } = useTranslation();
  return <Badge variant={INVOICE_STATE_BADGE[state]}>{t(`finance.states.${state}`)}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const { t } = useTranslation();
  return (
    <Badge variant={PAYMENT_STATUS_BADGE[status]}>{t(`finance.paymentStatuses.${status}`)}</Badge>
  );
}
