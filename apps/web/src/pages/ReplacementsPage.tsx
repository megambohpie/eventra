import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { listReplacements } from '@eventra/api-client';
import { REPLACEMENT_STATUSES, type ReplacementStatus } from '@eventra/shared';
import { api } from '@/api';
import { ReplacementStatusBadge, UrgencyBadge } from '@/components/incidents/badges';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { Pagination } from '@/components/ui/Pagination';
import { useResource } from '@/hooks/useResource';

const PAGE_SIZE = 20;

/** Antrean tugas penggantian untuk gudang: pilih, verifikasi, dan kirim aset pengganti. */
export function ReplacementsPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ReplacementStatus | ''>('');
  const [page, setPage] = useState(1);
  const { data, loading } = useResource(
    () => listReplacements(api, { status: status || undefined, page, pageSize: PAGE_SIZE }),
    `${status}|${page}`,
  );

  return (
    <PageCard>
      <PageHeader title={t('replacements.listTitle')} subtitle={t('replacements.listSubtitle')}>
        <select
          className="select select-sm ev-control ev-select--auto"
          aria-label={t('common.status')}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as ReplacementStatus | '');
            setPage(1);
          }}
        >
          <option value="">
            {t('common.status')}: {t('common.all')}
          </option>
          {REPLACEMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`replacements.statuses.${s}`)}
            </option>
          ))}
        </select>
      </PageHeader>

      {loading && !data ? (
        <Loading />
      ) : (
        <div className="ev-table-wrap">
          <table className="table">
            <thead className="ev-table__head">
              <tr>
                <th>{t('replacements.number')}</th>
                <th>{t('replacements.oldAsset')}</th>
                <th>{t('replacements.product')}</th>
                <th>{t('incidents.order')}</th>
                <th>{t('incidents.urgency')}</th>
                <th>{t('common.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.items.map((r) => (
                <tr key={r.id} className="ev-table__row">
                  <td>
                    <Link className="ev-link" to={`/replacements/${r.id}`}>
                      {r.number}
                    </Link>
                    <span className="ev-table__hint ev-table__hint--block">{r.incidentNumber}</span>
                  </td>
                  <td>{r.oldAsset.code}</td>
                  <td>{r.productName}</td>
                  <td>
                    {r.orderNumber}
                    <span className="ev-table__hint ev-table__hint--block">{r.eventLocation}</span>
                  </td>
                  <td>
                    <UrgencyBadge urgency={r.urgency} />
                  </td>
                  <td>
                    <ReplacementStatusBadge status={r.status} />
                  </td>
                  <td className="ev-table__actions">
                    <Link className="btn btn-ghost btn-sm" to={`/replacements/${r.id}`}>
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
  );
}
