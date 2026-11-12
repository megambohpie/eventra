import { useTranslation } from 'react-i18next';
import {
  PICK_ITEM_STATUS_BADGE,
  PICK_LIST_STATUS_BADGE,
  type PickItemStatus,
  type PickListStatus,
} from '@eventra/shared';
import { Badge } from '@/components/ui/Badge';

export function PickListStatusBadge({ status }: { status: PickListStatus }) {
  const { t } = useTranslation();
  return (
    <Badge variant={PICK_LIST_STATUS_BADGE[status]}>{t(`warehouse.statuses.${status}`)}</Badge>
  );
}

export function PickItemStatusBadge({ status }: { status: PickItemStatus }) {
  const { t } = useTranslation();
  return (
    <Badge variant={PICK_ITEM_STATUS_BADGE[status]}>{t(`warehouse.itemStatuses.${status}`)}</Badge>
  );
}
