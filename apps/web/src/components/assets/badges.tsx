import { useTranslation } from 'react-i18next';
import {
  ASSET_STATUS_BADGE,
  type AssetCondition,
  type AssetStatus,
  type BadgeVariant,
} from '@eventra/shared';
import { Badge } from '@/components/ui/Badge';

const CONDITION_BADGE: Record<AssetCondition, BadgeVariant> = {
  EXCELLENT: 'success',
  GOOD: 'success',
  FAIR: 'info',
  POOR: 'warning',
  DAMAGED: 'error',
};

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  const { t } = useTranslation();
  return <Badge variant={ASSET_STATUS_BADGE[status]}>{t(`assets.statuses.${status}`)}</Badge>;
}

export function ConditionBadge({ condition }: { condition: AssetCondition }) {
  const { t } = useTranslation();
  return <Badge variant={CONDITION_BADGE[condition]}>{t(`assets.conditions.${condition}`)}</Badge>;
}
