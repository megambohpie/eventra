import { useState } from 'react';
import { mdiAlertCircleOutline, mdiPlus, mdiPrinter } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  getAssetLabelsPdf,
  getAssetSummary,
  listAssets,
  listLocations,
  listProducts,
} from '@eventra/api-client';
import {
  ASSET_CONDITIONS,
  ASSET_STATUSES,
  MAX_LABELS,
  type AssetCondition,
  type AssetStatus,
} from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { AssetModal } from '@/components/assets/AssetModal';
import { AssetStatusBadge, ConditionBadge } from '@/components/assets/badges';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { useResource } from '@/hooks/useResource';
import { downloadBlob } from '@/lib/download';
import { notify } from '@/lib/notifications';

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
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const filterKey = `${q}|${status}|${condition}|${locationId}|${attention}|${page}`;
  const { data, loading, reload } = useResource(
    () =>
      listAssets(api, {
        q: q || undefined,
        status: status || undefined,
        condition: condition || undefined,
        locationId: locationId || undefined,
        attention: attention ? 'true' : undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    filterKey,
  );
  const summary = useResource(() => getAssetSummary(api), `summary-${data?.total ?? 0}`);
  const locations = useResource(() => listLocations(api), 'locations');
  const products = useResource(
    () => (canWrite ? listProducts(api, { pageSize: 100 }) : Promise.resolve(undefined)),
    'products',
  );

  const resetPage = () => {
    setPage(1);
    setSelected([]);
  };
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const pageIds = data?.items.map((a) => a.id) ?? [];
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));

  const printLabels = async () => {
    if (selected.length > MAX_LABELS) {
      notify('error', t('assets.maxLabels', { max: MAX_LABELS }));
      return;
    }
    try {
      downloadBlob(await getAssetLabelsPdf(api, selected), 'eventra-qr-labels.pdf');
      notify('success', t('assets.labelsDownloaded'));
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

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
          {selected.length > 0 && (
            <Button size="sm" variant="secondary" icon={mdiPrinter} onClick={printLabels}>
              {t('assets.printLabels', { count: selected.length })}
            </Button>
          )}
        </div>

        {loading && !data ? (
          <Loading />
        ) : (
          <div className="ev-table-wrap">
            <table className="table">
              <thead className="ev-table__head">
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      aria-label={t('common.all')}
                      checked={allSelected}
                      onChange={() =>
                        setSelected((prev) =>
                          allSelected
                            ? prev.filter((id) => !pageIds.includes(id))
                            : [...new Set([...prev, ...pageIds])],
                        )
                      }
                    />
                  </th>
                  <th>{t('assets.code')}</th>
                  <th>{t('assets.product')}</th>
                  <th>{t('assets.serial')}</th>
                  <th>{t('assets.condition')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('assets.location')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data?.items.map((asset) => (
                  <tr key={asset.id} className="ev-table__row">
                    <td>
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        aria-label={t('assets.selectAsset', { code: asset.code })}
                        checked={selected.includes(asset.id)}
                        onChange={() => toggle(asset.id)}
                      />
                    </td>
                    <td>
                      <Link to={`/assets/${asset.id}`} className="link ev-link">
                        {asset.code}
                      </Link>
                      {asset.needsAttention && (
                        <Icon
                          path={mdiAlertCircleOutline}
                          className="ev-icon--warning"
                          title={t('assets.attention')}
                        />
                      )}
                    </td>
                    <td>{asset.product.name}</td>
                    <td>{asset.serial ?? '-'}</td>
                    <td>
                      <ConditionBadge condition={asset.condition} />
                    </td>
                    <td>
                      <AssetStatusBadge status={asset.status} />
                    </td>
                    <td>{asset.location?.name ?? '-'}</td>
                    <td className="ev-table__actions">
                      <Link to={`/assets/${asset.id}`} className="btn btn-ghost btn-sm">
                        {t('common.details')}
                      </Link>
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
