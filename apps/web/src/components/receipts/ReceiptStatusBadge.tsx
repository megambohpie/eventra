import { useTranslation } from 'react-i18next';
import type { BadgeVariant, ReceiptStatus } from '@eventra/shared';
import { Badge } from '@/components/ui/Badge';

const RECEIPT_BADGE: Record<ReceiptStatus, BadgeVariant> = {
  DRAFT: 'warning',
  RECEIVED: 'success',
  CANCELLED: 'neutral',
};

export function ReceiptStatusBadge({ status }: { status: ReceiptStatus }) {
  const { t } = useTranslation();
  return <Badge variant={RECEIPT_BADGE[status]}>{t(`receipts.statuses.${status}`)}</Badge>;
}
