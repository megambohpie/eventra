import { useState } from 'react';
import { mdiCheck, mdiClose, mdiPlay, mdiPlus } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { cancelServiceTicket, listServiceTickets, startServiceTicket } from '@eventra/api-client';
import {
  INSPECTION_RESULTS,
  SERVICE_TICKET_STATUSES,
  type ServiceTicketDto,
  type ServiceTicketStatus,
} from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { TicketStatusBadge } from '@/components/incidents/badges';
import { TicketCompleteModal, TicketCreateModal } from '@/components/incidents/TicketModals';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { Pagination } from '@/components/ui/Pagination';
import { ReasonModal } from '@/components/ui/ReasonModal';
import { SearchInput } from '@/components/ui/SearchInput';
import { useResource } from '@/hooks/useResource';
import { formatDateTime, formatRupiah } from '@/lib/format';
import { notify } from '@/lib/notifications';

const PAGE_SIZE = 20;
type Dialog = { kind: 'create' } | { kind: 'complete' | 'cancel'; ticket: ServiceTicketDto } | null;

export function ServiceTicketsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canWrite = can('service.write');
  const canCost = can('asset.cost.read');
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [status, setStatus] = useState<ServiceTicketStatus | ''>('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);

  const { data, loading, reload } = useResource(
    () =>
      listServiceTickets(api, {
        q: q || undefined,
        status: status || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    `${q}|${status}|${page}`,
  );

  const start = (ticket: ServiceTicketDto) => async () => {
    try {
      await startServiceTicket(api, ticket.id);
      notify('success', t('service.started'));
      reload();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  return (
    <>
      <PageCard>
        <PageHeader title={t('service.title')} subtitle={t('service.subtitle')}>
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
              setStatus(e.target.value as ServiceTicketStatus | '');
              setPage(1);
            }}
          >
            <option value="">
              {t('common.status')}: {t('common.all')}
            </option>
            {SERVICE_TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`service.statuses.${s}`)}
              </option>
            ))}
          </select>
          {canWrite && (
            <Button
              size="sm"
              variant="primary"
              icon={mdiPlus}
              onClick={() => setDialog({ kind: 'create' })}
            >
              {t('service.new')}
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
                  <th>{t('service.number')}</th>
                  <th>{t('service.asset')}</th>
                  <th>{t('service.complaint')}</th>
                  <th>{t('service.vendor')}</th>
                  {canCost && <th>{t('service.cost')}</th>}
                  <th>{t('common.status')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data?.items.map((s) => (
                  <tr key={s.id} className="ev-table__row">
                    <td>
                      {s.number}
                      {s.incidentId && s.incidentNumber && (
                        <Link
                          className="ev-link ev-table__hint ev-table__hint--block"
                          to={`/incidents/${s.incidentId}`}
                        >
                          {s.incidentNumber}
                        </Link>
                      )}
                    </td>
                    <td>
                      <Link className="ev-link" to={`/assets/${s.assetId}`}>
                        {s.assetCode}
                      </Link>
                      <span className="ev-table__hint ev-table__hint--block">{s.productName}</span>
                    </td>
                    <td className="ev-cell--wrap">
                      {s.complaint}
                      {s.actionTaken && (
                        <span className="ev-table__hint ev-table__hint--block">
                          {s.actionTaken}
                        </span>
                      )}
                    </td>
                    <td>{s.vendor ?? '-'}</td>
                    {canCost && <td>{s.cost == null ? '-' : formatRupiah(s.cost)}</td>}
                    <td>
                      <TicketStatusBadge status={s.status} />
                      {s.inspection && (
                        <Badge
                          variant={s.inspection === INSPECTION_RESULTS[0] ? 'success' : 'error'}
                        >
                          {t(`service.inspections.${s.inspection}`)}
                        </Badge>
                      )}
                      {s.completedAt && (
                        <span className="ev-table__hint ev-table__hint--block">
                          {formatDateTime(s.completedAt)}
                        </span>
                      )}
                    </td>
                    <td className="ev-table__actions">
                      {canWrite && s.status === 'OPEN' && (
                        <Button size="xs" variant="ghost" icon={mdiPlay} onClick={start(s)}>
                          {t('service.start')}
                        </Button>
                      )}
                      {canWrite && s.status === 'IN_PROGRESS' && (
                        <Button
                          size="xs"
                          variant="success"
                          icon={mdiCheck}
                          onClick={() => setDialog({ kind: 'complete', ticket: s })}
                        >
                          {t('service.complete')}
                        </Button>
                      )}
                      {canWrite && (s.status === 'OPEN' || s.status === 'IN_PROGRESS') && (
                        <Button
                          size="xs"
                          variant="ghost"
                          icon={mdiClose}
                          onClick={() => setDialog({ kind: 'cancel', ticket: s })}
                        >
                          {t('common.cancel')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {data?.items.length === 0 && (
                  <tr>
                    <td colSpan={canCost ? 7 : 6} className="ev-table__empty">
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

      {dialog?.kind === 'create' && (
        <TicketCreateModal onClose={() => setDialog(null)} onChanged={reload} />
      )}
      {dialog?.kind === 'complete' && (
        <TicketCompleteModal
          ticket={dialog.ticket}
          canCost={canCost}
          onClose={() => setDialog(null)}
          onChanged={reload}
        />
      )}
      {dialog?.kind === 'cancel' && (
        <ReasonModal
          title={t('service.cancelTitle', { number: dialog.ticket.number })}
          label={t('service.cancelReason')}
          confirmLabel={t('service.cancelAction')}
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            try {
              await cancelServiceTicket(api, dialog.ticket.id, { reason });
              notify('success', t('service.cancelled'));
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
