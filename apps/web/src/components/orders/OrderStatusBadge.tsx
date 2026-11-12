import { useTranslation } from 'react-i18next';
import { ORDER_STATUS_BADGE, type OrderStatus } from '@eventra/shared';
import { Badge } from '@/components/ui/Badge';

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  return <Badge variant={ORDER_STATUS_BADGE[status]}>{t(`orders.statuses.${status}`)}</Badge>;
}
