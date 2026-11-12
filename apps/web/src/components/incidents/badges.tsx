import { useTranslation } from 'react-i18next';
import {
  INCIDENT_STATUS_BADGE,
  INCIDENT_URGENCY_BADGE,
  REPLACEMENT_STATUS_BADGE,
  SERVICE_TICKET_STATUS_BADGE,
  type IncidentStatus,
  type IncidentUrgency,
  type ReplacementStatus,
  type ServiceTicketStatus,
} from '@eventra/shared';
import { Badge } from '@/components/ui/Badge';

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  const { t } = useTranslation();
  return <Badge variant={INCIDENT_STATUS_BADGE[status]}>{t(`incidents.statuses.${status}`)}</Badge>;
}

export function UrgencyBadge({ urgency }: { urgency: IncidentUrgency }) {
  const { t } = useTranslation();
  return (
    <Badge variant={INCIDENT_URGENCY_BADGE[urgency]}>{t(`incidents.urgencies.${urgency}`)}</Badge>
  );
}

export function TicketStatusBadge({ status }: { status: ServiceTicketStatus }) {
  const { t } = useTranslation();
  return (
    <Badge variant={SERVICE_TICKET_STATUS_BADGE[status]}>{t(`service.statuses.${status}`)}</Badge>
  );
}

export function ReplacementStatusBadge({ status }: { status: ReplacementStatus }) {
  const { t } = useTranslation();
  return (
    <Badge variant={REPLACEMENT_STATUS_BADGE[status]}>{t(`replacements.statuses.${status}`)}</Badge>
  );
}
