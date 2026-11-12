import { useState } from 'react';
import { mdiPlus } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { listLocations, listProducts, listReceipts } from '@eventra/api-client';
import { RECEIPT_STATUSES, type ReceiptDto, type ReceiptStatus } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { ReceiptDetailModal } from '@/components/receipts/ReceiptDetailModal';
import { ReceiptModal } from '@/components/receipts/ReceiptModal';
import { ReceiptStatusBadge } from '@/components/receipts/ReceiptStatusBadge';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { useResource } from '@/hooks/useResource';
import { formatDate } from '@/lib/format';

const PAGE_SIZE = 20;

type Dialog = { kind: 'form'; receipt?: ReceiptDto } | { kind: 'detail'; id: string } | null;

export function ReceiptsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canWrite = can('receipt.write');
  const canSeeCost = can('asset.cost.read');

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ReceiptStatus | ''>('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);

  const { data, loading, reload } = useResource(
    () =>
      listReceipts(api, {
        q: q || undefined,
        status: status || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    `${q}|${status}|${page}`,
  );
  const products = useResource(
    () => (canWrite ? listProducts(api, { pageSize: 100 }) : Promise.resolve(undefined)),
    'products',
  );
  const locations = useResource(() => listLocations(api), 'locations');

  const hasLocation = (locations.data ?? []).some((l) => l.active);
  const hasProduct = (products.data?.items ?? []).some((p) => p.active);
  const activeProducts = (products.data?.items ?? []).filter((p) => p.active);

  return (
    <>
      <PageCard>
        <PageHeader title={t('receipts.title')} subtitle={t('receipts.subtitle')}>
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
              setStatus(e.target.value as ReceiptStatus | '');
              setPage(1);
            }}
          >
            <option value="">
              {t('common.status')}: {t('common.all')}
            </option>
            {RECEIPT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`receipts.statuses.${s}`)}
              </option>
            ))}
          </select>
          {canWrite && (
            <Button
              size="sm"
              variant="primary"
              icon={mdiPlus}
              disabled={!hasLocation || !hasProduct}
              onClick={() => setDialog({ kind: 'form' })}
            >
              {t('receipts.new')}
            </Button>
          )}
        </PageHeader>
        {canWrite && products.data && !hasProduct && (
          <div role="alert" className="alert alert-info ev-notice">
            <span>{t('receipts.needProduct')}</span>
          </div>
        )}
        {canWrite && locations.data && !hasLocation && (
          <div role="alert" className="alert alert-info ev-notice">
            <span>{t('receipts.needLocation')}</span>
          </div>
        )}

        {loading && !data ? (
          <Loading />
        ) : (
          <div className="ev-table-wrap">
            <table className="table">
              <thead className="ev-table__head">
                <tr>
                  <th>{t('receipts.number')}</th>
                  <th>{t('receipts.receivedDate')}</th>
                  <th>{t('receipts.source')}</th>
                  <th>{t('receipts.supplier')}</th>
                  <th>{t('receipts.location')}</th>
                  <th>{t('receipts.units')}</th>
                  <th>{t('common.status')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data?.items.map((receipt) => (
                  <tr key={receipt.id} className="ev-table__row">
                    <td>{receipt.number}</td>
                    <td>{formatDate(receipt.receivedDate)}</td>
                    <td>{t(`receipts.sources.${receipt.source}`)}</td>
                    <td>{receipt.supplier ?? '-'}</td>
                    <td>{receipt.locationName}</td>
                    <td>{receipt.totalUnits}</td>
                    <td>
                      <ReceiptStatusBadge status={receipt.status} />
                    </td>
                    <td className="ev-table__actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDialog({ kind: 'detail', id: receipt.id })}
                      >
                        {t('common.details')}
                      </Button>
                    </td>
                  </tr>
                ))}
                {data?.items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="ev-table__empty">
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

      {dialog?.kind === 'detail' && (
        <ReceiptDetailModal
          key={dialog.id}
          receiptId={dialog.id}
          canWrite={canWrite}
          canSeeCost={canSeeCost}
          onEdit={(receipt) => setDialog({ kind: 'form', receipt })}
          onClose={() => setDialog(null)}
          onChanged={reload}
        />
      )}
      {dialog?.kind === 'form' && locations.data && products.data && (
        <ReceiptModal
          key={dialog.receipt?.id ?? 'new'}
          receipt={dialog.receipt}
          products={activeProducts}
          locations={locations.data}
          canSeeCost={canSeeCost}
          onClose={() => setDialog(null)}
          onChanged={reload}
        />
      )}
    </>
  );
}
