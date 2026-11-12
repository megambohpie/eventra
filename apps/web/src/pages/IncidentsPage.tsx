import { useState } from 'react';
import { mdiAlertPlus } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { listIncidents } from '@eventra/api-client';
import {
  INCIDENT_STATUSES,
  INCIDENT_URGENCIES,
  type IncidentStatus,
  type IncidentUrgency,
} from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { IncidentStatusBadge, UrgencyBadge } from '@/components/incidents/badges';
import { ReportModal } from '@/components/incidents/ReportModal';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { useResource } from '@/hooks/useResource';
import { formatDateTime } from '@/lib/format';

const PAGE_SIZE = 20;

export function IncidentsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<IncidentStatus | ''>('');
  const [urgency, setUrgency] = useState<IncidentUrgency | ''>('');
  const [page, setPage] = useState(1);
  const [reporting, setReporting] = useState(false);

  const { data, loading } = useResource(
    () =>
      listIncidents(api, {
        q: q || undefined,
        status: status || undefined,
        urgency: urgency || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    `${q}|${status}|${urgency}|${page}`,
  );

  return (
    <>
      <PageCard>
        <PageHeader title={t('incidents.title')} subtitle={t('incidents.subtitle')}>
          <SearchInput
            value={q}
            onChange={(value) => {
              setQ(value);
              setPage(1);
            }}
          />
          <select
            className="select select-sm ev-control ev-select--auto"
            aria-label={t('common.status')}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as IncidentStatus | '');
              setPage(1);
            }}
          >
            <option value="">
              {t('common.status')}: {t('common.all')}
            </option>
            {INCIDENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`incidents.statuses.${s}`)}
              </option>
            ))}
          </select>
          <select
            className="select select-sm ev-control ev-select--auto"
            aria-label={t('incidents.urgency')}
            value={urgency}
            onChange={(e) => {
              setUrgency(e.target.value as IncidentUrgency | '');
              setPage(1);
            }}
          >
            <option value="">
              {t('incidents.urgency')}: {t('common.all')}
            </option>
            {INCIDENT_URGENCIES.map((u) => (
              <option key={u} value={u}>
                {t(`incidents.urgencies.${u}`)}
              </option>
            ))}
          </select>
          {can('incident.report') && (
            <Button
              size="sm"
              variant="primary"
              icon={mdiAlertPlus}
              onClick={() => setReporting(true)}
            >
              {t('incidents.new')}
            </Button>
          )}
        </PageHeader>

        {loading && !data ? (
          <Loading />
        ) : (
          <div className="ev-table-wrap">
            <table className="table">
              <thead className="ev-table__head">
                <tr>
                  <th>{t('incidents.number')}</th>
                  <th>{t('incidents.asset')}</th>
                  <th>{t('incidents.order')}</th>
                  <th>{t('incidents.urgency')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('incidents.reportedAt')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data?.items.map((i) => (
                  <tr key={i.id} className="ev-table__row">
                    <td>
                      <Link className="ev-link" to={`/incidents/${i.id}`}>
                        {i.number}
                      </Link>
                      <span className="ev-table__hint ev-table__hint--block">{i.reporter}</span>
                    </td>
                    <td>
                      {i.assetCode}
                      <span className="ev-table__hint ev-table__hint--block">{i.productName}</span>
                    </td>
                    <td>
                      {i.orderNumber}
                      <span className="ev-table__hint ev-table__hint--block">
                        {i.eventLocation}
                      </span>
                    </td>
                    <td>
                      <UrgencyBadge urgency={i.urgency} />
                    </td>
                    <td>
                      <IncidentStatusBadge status={i.status} />
                    </td>
                    <td>{i.reportedAt ? formatDateTime(i.reportedAt) : '-'}</td>
                    <td className="ev-table__actions">
                      <Link className="btn btn-ghost btn-sm" to={`/incidents/${i.id}`}>
                        {t('common.details')}
                      </Link>
                    </td>
                  </tr>
                ))}
                {data?.items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="ev-table__empty">
                      {t('common.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {data && (
          <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
        )}
      </PageCard>

      {reporting && (
        <ReportModal
          onClose={() => setReporting(false)}
          onCreated={(id) => navigate(`/incidents/${id}`)}
        />
      )}
    </>
  );
}
