import { useTranslation } from 'react-i18next';
import { listServiceTickets } from '@eventra/api-client';
import { INSPECTION_RESULTS } from '@eventra/shared';
import { api } from '@/api';
import { ConditionBadge } from '@/components/assets/badges';
import { TicketStatusBadge } from '@/components/incidents/badges';
import { Badge } from '@/components/ui/Badge';
import { Loading } from '@/components/ui/Loading';
import { useResource } from '@/hooks/useResource';
import { formatDateTime, formatRupiah } from '@/lib/format';

/** Riwayat servis satu unit: tiket, keluhan, tindakan, hasil pemeriksaan, dan biaya (bila berwenang). */
export function AssetServiceHistory({ assetId }: { assetId: string }) {
  const { t } = useTranslation();
  const { data } = useResource(
    () => listServiceTickets(api, { assetId, pageSize: 100 }),
    `service-history-${assetId}`,
  );
  if (!data) return <Loading />;
  if (data.items.length === 0) return <p className="ev-hint">{t('assets.history.noServices')}</p>;

  return (
    <ul className="ev-history">
      {data.items.map((s) => (
        <li key={s.id} className="ev-history__item">
          <div className="ev-history__head">
            <strong>{s.number}</strong>
            <span className="ev-history__badges">
              <TicketStatusBadge status={s.status} />
              {s.inspection && (
                <Badge variant={s.inspection === INSPECTION_RESULTS[0] ? 'success' : 'error'}>
                  {t(`service.inspections.${s.inspection}`)}
                </Badge>
              )}
            </span>
          </div>
          <p className="ev-history__line">{s.complaint}</p>
          {s.actionTaken && <p className="ev-history__meta">{s.actionTaken}</p>}
          <p className="ev-history__meta">
            {[
              formatDateTime(s.completedAt ?? s.startedAt ?? s.createdAt),
              s.vendor,
              s.incidentNumber,
              s.cost == null ? null : formatRupiah(s.cost),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="ev-history__cond">
            <ConditionBadge condition={s.conditionBefore} />
            {s.conditionAfter && (
              <>
                <span aria-hidden>→</span>
                <ConditionBadge condition={s.conditionAfter} />
              </>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}
