import { Fragment, useState } from 'react';
import { mdiAlertCircleOutline, mdiChevronDown, mdiChevronUp, mdiPlus } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { getAssetSummary, listAssetGroups, listLocations, listProducts } from '@eventra/api-client';
import {
  ASSET_CONDITIONS,
  ASSET_STATUSES,
  type AssetCondition,
  type AssetStatus,
} from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { AssetModal } from '@/components/assets/AssetModal';
import { AssetBatchDrawer } from '@/components/assets/AssetBatchDrawer';
import { AssetBatchList } from '@/components/assets/AssetBatchList';
import { AssetStatusBadge } from '@/components/assets/badges';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { useResource } from '@/hooks/useResource';

const PAGE_SIZE = 20;

export function AssetsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canWrite = can('asset.write');
  const canSeeCost = can('asset.cost.read');

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<AssetStatus | ''>('');
  const [condition, setCondition] = useState<AssetCondition | ''>('');
  const [locationId, setLocationId] = useState('');
  const [attention, setAttention] = useState(false);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<{
    productId: string;
    productName: string;
    date: string;
  } | null>(null);
  const [creating, setCreating] = useState(false);

  const filters = {
    q: q || undefined,
    status: status || undefined,
    condition: condition || undefined,
    locationId: locationId || undefined,
    attention: attention ? ('true' as const) : undefined,
  };
  const filterKey = `${q}|${status}|${condition}|${locationId}|${attention}|${page}`;
  const { data, loading, reload } = useResource(
    () => listAssetGroups(api, { ...filters, page, pageSize: PAGE_SIZE }),
    filterKey,
  );
  const summary = useResource(() => getAssetSummary(api), `summary-${data?.total ?? 0}`);
  const locations = useResource(() => listLocations(api), 'locations');
  const products = useResource(
    () => (canWrite ? listProducts(api, { pageSize: 100 }) : Promise.resolve(undefined)),
    'products',
  );

  const resetPage = () => setPage(1);

  const stats = summary.data;
  const tiles = [
    { key: 'total', value: stats?.total },
    { key: 'available', value: stats?.byStatus.AVAILABLE },
    { key: 'attention', value: stats?.attention, alert: true },
    { key: 'inService', value: stats?.byStatus.IN_SERVICE },
    { key: 'quarantined', value: stats?.byStatus.QUARANTINED },
  ];

  return (
    <>
      <PageCard>
        <PageHeader title={t('assets.title')} subtitle={t('assets.subtitle')}>
          <SearchInput
            value={q}
            onChange={(value) => {
              setQ(value);
              resetPage();
            }}
          />
          {canWrite && (
            <Button
              size="sm"
              variant="primary"
              icon={mdiPlus}
              disabled={!products.data || products.data.items.length === 0}
              onClick={() => setCreating(true)}
            >
              {t('assets.new')}
            </Button>
          )}
        </PageHeader>

        <div className="ev-stats">
          {tiles.map((tile) => (
            <div
              key={tile.key}
              className="stats ev-stat"
              data-alert={Boolean(tile.alert && (tile.value ?? 0) > 0)}
            >
              <div className="stat ev-stat__body">
                <div className="stat-title">{t(`assets.summary.${tile.key}`)}</div>
                <div className="stat-value ev-stat__value">{tile.value ?? 0}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="ev-filters">
          <select
            className="select select-sm ev-control"
            aria-label={t('assets.filterStatus')}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as AssetStatus | '');
              resetPage();
            }}
          >
            <option value="">
              {t('assets.filterStatus')}: {t('common.all')}
            </option>
            {ASSET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`assets.statuses.${s}`)}
              </option>
            ))}
          </select>
          <select
            className="select select-sm ev-control"
            aria-label={t('assets.filterCondition')}
            value={condition}
            onChange={(e) => {
              setCondition(e.target.value as AssetCondition | '');
              resetPage();
            }}
          >
            <option value="">
              {t('assets.filterCondition')}: {t('common.all')}
            </option>
            {ASSET_CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {t(`assets.conditions.${c}`)}
              </option>
            ))}
          </select>
          <select
            className="select select-sm ev-control"
            aria-label={t('assets.filterLocation')}
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              resetPage();
            }}
          >
            <option value="">
              {t('assets.filterLocation')}: {t('common.all')}
            </option>
            {locations.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <label className="label ev-toggle-row">
            <input
              type="checkbox"
              className="toggle toggle-warning toggle-sm"
              checked={attention}
              onChange={(e) => {
                setAttention(e.target.checked);
                resetPage();
              }}
            />
            {t('assets.onlyAttention')}
          </label>
        </div>

        {loading && !data ? (
          <Loading />
        ) : (
          <div className="ev-table-wrap">
            <table className="table">
              <thead className="ev-table__head">
                <tr>
                  <th>{t('assets.product')}</th>
                  <th>{t('assets.qty')}</th>
                  <th>{t('common.status')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data?.items.map((group) => {
                  const isOpen = expanded === group.productId;
                  const toggle = () => setExpanded(isOpen ? null : group.productId);
                  return (
                    <Fragment key={group.productId}>
                      <tr
                        className="ev-table__row ev-table__row--click"
                        data-open={isOpen}
                        onClick={toggle}
                      >
                        <td>
                          <strong>{group.productName}</strong>
                          <span className="ev-table__hint ev-table__hint--block">
                            {[group.categoryName, group.sku].filter(Boolean).join(' · ')}
                          </span>
                        </td>
                        <td className="ev-qty">{group.total}</td>
                        <td>
                          <span className="ev-chips">
                            {ASSET_STATUSES.filter((st) => group.byStatus[st]).map((st) => (
                              <span key={st} className="ev-chip">
                                <AssetStatusBadge status={st} /> {group.byStatus[st]}
                              </span>
                            ))}
                            {group.attention > 0 && (
                              <Icon
                                path={mdiAlertCircleOutline}
                                className="ev-icon--warning"
                                title={t('assets.attention')}
                              />
                            )}
                          </span>
                        </td>
                        <td className="ev-table__actions">
                          <Icon path={isOpen ? mdiChevronUp : mdiChevronDown} />
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="ev-table__expand">
                          <td colSpan={4}>
                            <AssetBatchList
                              productId={group.productId}
                              filters={filters}
                              onOpen={(batch) =>
                                setDrawer({
                                  productId: group.productId,
                                  productName: group.productName,
                                  date: batch.date,
                                })
                              }
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {data?.items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="ev-table__empty">
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

      {drawer && (
        <AssetBatchDrawer
          productId={drawer.productId}
          productName={drawer.productName}
          date={drawer.date}
          filters={filters}
          onClose={() => setDrawer(null)}
        />
      )}

      {creating && products.data && locations.data && (
        <AssetModal
          products={products.data.items}
          locations={locations.data}
          canSeeCost={canSeeCost}
          onClose={() => setCreating(false)}
          onChanged={() => {
            reload();
            summary.reload();
          }}
        />
      )}
    </>
  );
}
