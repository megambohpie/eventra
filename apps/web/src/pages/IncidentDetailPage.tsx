import { useState } from 'react';
import { mdiCheckCircle, mdiGavel, mdiSend, mdiSwapHorizontal } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { cancelReplacement, getIncident, submitIncident } from '@eventra/api-client';
import { REVIEWABLE_INCIDENT_STATUSES, type IncidentDto } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { AssetStatusBadge, ConditionBadge } from '@/components/assets/badges';
import { IncidentPhotos } from '@/components/incidents/IncidentPhotos';
import { CloseModal } from '@/components/incidents/CloseModal';
import { ReceiveForm, ReplacementInfo } from '@/components/incidents/ReplacementInfo';
import { ReviewModal } from '@/components/incidents/ReviewModal';
import {
  IncidentStatusBadge,
  TicketStatusBadge,
  UrgencyBadge,
} from '@/components/incidents/badges';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { ReasonModal } from '@/components/ui/ReasonModal';
import { useResource } from '@/hooks/useResource';
import { formatDateTime } from '@/lib/format';
import { notify } from '@/lib/notifications';

type Dialog = 'review' | 'close' | 'cancelReplacement' | null;

export function IncidentDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { data: incident, loading, reload } = useResource(() => getIncident(api, id), id);

  if (loading && !incident) return <Loading />;
  if (!incident) {
    return (
      <PageCard>
        <p>{t('common.empty')}</p>
        <Link className="btn btn-ghost btn-sm" to="/incidents">
          {t('common.back')}
        </Link>
      </PageCard>
    );
  }
  return <Detail incident={incident} reload={reload} />;
}

function Detail({ incident, reload }: { incident: IncidentDto; reload: () => void }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [dialog, setDialog] = useState<Dialog>(null);

  const isDraft = incident.status === 'DRAFT';
  const canReview = can('incident.review');
  const reviewable = canReview && REVIEWABLE_INCIDENT_STATUSES.includes(incident.status);
  const closable =
    canReview &&
    (incident.status === 'GUIDANCE_GIVEN' || incident.status === 'TECHNICIAN_ASSIGNED');
  const task = incident.replacement;
  const cancellable =
    canReview &&
    task !== null &&
    (task.status === 'PENDING_PICK' || task.status === 'PICKED' || task.status === 'VERIFIED');
  const canSubmit = isDraft && can('incident.report') && incident.photoCount >= 1;
  const canReceive = task?.status === 'DISPATCHED' && can('replacement.receive');

  const submit = async () => {
    try {
      await submitIncident(api, incident.id);
      notify('success', t('incidents.submitted'));
      reload();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  return (
    <>
      <PageCard>
        <PageHeader
          title={incident.number}
          subtitle={`${incident.assetCode} · ${incident.productName}`}
        >
          <Link className="btn btn-ghost btn-sm" to="/incidents">
            {t('common.back')}
          </Link>
          {isDraft && can('incident.report') && (
            <Button
              size="sm"
              variant="primary"
              icon={mdiSend}
              disabled={!canSubmit}
              onClick={submit}
            >
              {t('incidents.submit')}
            </Button>
          )}
          {reviewable && (
            <Button size="sm" variant="primary" icon={mdiGavel} onClick={() => setDialog('review')}>
              {t('incidents.review')}
            </Button>
          )}
          {closable && (
            <Button
              size="sm"
              variant="success"
              icon={mdiCheckCircle}
              onClick={() => setDialog('close')}
            >
              {t('incidents.closeAction')}
            </Button>
          )}
        </PageHeader>

        <div className="ev-detail__badges">
          <IncidentStatusBadge status={incident.status} />
          <UrgencyBadge urgency={incident.urgency} />
        </div>
        {isDraft && (
          <div role="alert" className={`alert ${canSubmit ? 'alert-info' : 'alert-warning'}`}>
            <span>{t(canSubmit ? 'incidents.draftReady' : 'incidents.draftNeedPhotos')}</span>
          </div>
        )}

        <dl className="ev-dl">
          <div className="ev-dl__row">
            <dt className="ev-dl__term">{t('incidents.asset')}</dt>
            <dd className="ev-dl__desc">
              {can('asset.read') ? (
                <Link className="ev-link" to={`/assets/${incident.assetId}`}>
                  {incident.assetCode}
                </Link>
              ) : (
                incident.assetCode
              )}{' '}
              <AssetStatusBadge status={incident.assetStatus} />{' '}
              <ConditionBadge condition={incident.assetCondition} />
            </dd>
          </div>
          <div className="ev-dl__row">
            <dt className="ev-dl__term">{t('incidents.order')}</dt>
            <dd className="ev-dl__desc">
              {can('order.read') ? (
                <Link className="ev-link" to={`/orders/${incident.orderId}`}>
                  {incident.orderNumber}
                </Link>
              ) : (
                incident.orderNumber
              )}{' '}
              · {incident.customerName} · {incident.eventLocation}
            </dd>
          </div>
          <div className="ev-dl__row">
            <dt className="ev-dl__term">{t('incidents.reporter')}</dt>
            <dd className="ev-dl__desc">
              {incident.reporter}
              {incident.reportedAt && ` · ${formatDateTime(incident.reportedAt)}`}
            </dd>
          </div>
          <div className="ev-dl__row">
            <dt className="ev-dl__term">{t('incidents.description')}</dt>
            <dd className="ev-dl__desc ev-dl__desc--wrap">{incident.description}</dd>
          </div>
          {incident.locationNote && (
            <div className="ev-dl__row">
              <dt className="ev-dl__term">{t('incidents.locationNote')}</dt>
              <dd className="ev-dl__desc">{incident.locationNote}</dd>
            </div>
          )}
          {incident.decision && (
            <div className="ev-dl__row">
              <dt className="ev-dl__term">{t('incidents.decision')}</dt>
              <dd className="ev-dl__desc ev-dl__desc--wrap">
                {t(`incidents.decisions.${incident.decision}`)}
                {incident.reviewer && ` · ${incident.reviewer}`}
                {incident.decisionNote && ` — ${incident.decisionNote}`}
              </dd>
            </div>
          )}
          {incident.technicianName && (
            <div className="ev-dl__row">
              <dt className="ev-dl__term">{t('incidents.technician')}</dt>
              <dd className="ev-dl__desc">{incident.technicianName}</dd>
            </div>
          )}
          {incident.closeNote && (
            <div className="ev-dl__row">
              <dt className="ev-dl__term">{t('incidents.closeNote')}</dt>
              <dd className="ev-dl__desc ev-dl__desc--wrap">{incident.closeNote}</dd>
            </div>
          )}
        </dl>
      </PageCard>

      <PageCard>
        <h2 className="ev-section-title">
          {t('incidents.photos')} ({incident.photoCount}/5)
        </h2>
        <IncidentPhotos
          incidentId={incident.id}
          photoIds={incident.photoIds}
          canUpload={isDraft && can('incident.report')}
          onChanged={reload}
        />
      </PageCard>

      {task && (
        <PageCard>
          <h2 className="ev-section-title">{t('replacements.title')}</h2>
          <ReplacementInfo task={task} />
          <div className="ev-detail__actions">
            {can('warehouse.read') && (
              <Link className="btn btn-ghost btn-sm" to={`/replacements/${task.id}`}>
                <span>{t('replacements.openTask')}</span>
              </Link>
            )}
            {cancellable && (
              <Button
                size="sm"
                variant="ghost"
                icon={mdiSwapHorizontal}
                onClick={() => setDialog('cancelReplacement')}
              >
                {t('replacements.cancel')}
              </Button>
            )}
          </div>
          {canReceive && <ReceiveForm task={task} onChanged={reload} />}
        </PageCard>
      )}

      {incident.serviceTickets.length > 0 && can('service.read') && (
        <PageCard>
          <h2 className="ev-section-title">{t('service.title')}</h2>
          <div className="ev-table-wrap">
            <table className="table">
              <thead className="ev-table__head">
                <tr>
                  <th>{t('service.number')}</th>
                  <th>{t('service.complaint')}</th>
                  <th>{t('service.vendor')}</th>
                  <th>{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {incident.serviceTickets.map((s) => (
                  <tr key={s.id} className="ev-table__row">
                    <td>
                      <Link className="ev-link" to={`/service-tickets?q=${s.number}`}>
                        {s.number}
                      </Link>
                    </td>
                    <td>{s.complaint}</td>
                    <td>{s.vendor ?? '-'}</td>
                    <td>
                      <TicketStatusBadge status={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PageCard>
      )}

      <PageCard>
        <h2 className="ev-section-title">{t('incidents.history')}</h2>
        <div className="ev-table-wrap">
          <table className="table">
            <thead className="ev-table__head">
              <tr>
                <th>{t('incidents.when')}</th>
                <th>{t('common.status')}</th>
                <th>{t('incidents.by')}</th>
                <th>{t('common.note')}</th>
              </tr>
            </thead>
            <tbody>
              {incident.events.map((e) => (
                <tr key={e.id} className="ev-table__row">
                  <td>{formatDateTime(e.createdAt)}</td>
                  <td>
                    <IncidentStatusBadge status={e.toStatus} />
                  </td>
                  <td>{e.actor ?? '-'}</td>
                  <td>{e.note ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageCard>

      {dialog === 'review' && (
        <ReviewModal incidentId={incident.id} onClose={() => setDialog(null)} onChanged={reload} />
      )}
      {dialog === 'close' && (
        <CloseModal incidentId={incident.id} onClose={() => setDialog(null)} onChanged={reload} />
      )}
      {dialog === 'cancelReplacement' && task && (
        <ReasonModal
          title={t('replacements.cancel')}
          label={t('replacements.cancelReason')}
          confirmLabel={t('replacements.cancel')}
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            try {
              await cancelReplacement(api, task.id, { reason });
              notify('success', t('replacements.cancelled'));
              setDialog(null);
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
