import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { getReplacement } from '@eventra/api-client';
import type { ReplacementTaskDto } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { OldAssetReturn } from '@/components/incidents/OldAssetReturn';
import { ReplacementInfo } from '@/components/incidents/ReplacementInfo';
import { ReplacementSteps } from '@/components/incidents/ReplacementSteps';
import { UrgencyBadge } from '@/components/incidents/badges';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { useResource } from '@/hooks/useResource';

export function ReplacementDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { data: task, loading, reload } = useResource(() => getReplacement(api, id), id);

  if (loading && !task) return <Loading />;
  if (!task) {
    return (
      <PageCard>
        <p>{t('common.empty')}</p>
        <Link className="btn btn-ghost btn-sm" to="/replacements">
          {t('common.back')}
        </Link>
      </PageCard>
    );
  }
  return <Detail task={task} reload={reload} />;
}

function Detail({ task, reload }: { task: ReplacementTaskDto; reload: () => void }) {
  const { t } = useTranslation();
  const { can } = useAuth();

  return (
    <>
      <PageCard>
        <PageHeader title={task.number} subtitle={`${task.incidentNumber} · ${task.productName}`}>
          <Link className="btn btn-ghost btn-sm" to="/replacements">
            {t('common.back')}
          </Link>
          {can('incident.read') && (
            <Link className="btn btn-ghost btn-sm" to={`/incidents/${task.incidentId}`}>
              {t('replacements.openIncident')}
            </Link>
          )}
        </PageHeader>
        <div className="ev-detail__badges">
          <UrgencyBadge urgency={task.urgency} />
        </div>
        <dl className="ev-dl">
          <div className="ev-dl__row">
            <dt className="ev-dl__term">{t('incidents.order')}</dt>
            <dd className="ev-dl__desc">
              {task.orderNumber} · {task.eventLocation}
            </dd>
          </div>
        </dl>
        <ReplacementInfo task={task} />
      </PageCard>

      <PageCard>
        <ReplacementSteps task={task} onChanged={reload} />
      </PageCard>

      {task.status === 'RECEIVED' && (
        <PageCard>
          <OldAssetReturn task={task} onChanged={reload} />
        </PageCard>
      )}
    </>
  );
}
