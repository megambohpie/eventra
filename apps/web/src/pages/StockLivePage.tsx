import { useEffect, useEffectEvent, useState } from 'react';
import { mdiPause, mdiPlay, mdiRefresh } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getLiveStock } from '@eventra/api-client';
import type { LiveStockAssetDto, LiveStockBucket, LiveStockProductDto } from '@eventra/shared';
import { api } from '@/api';
import { AssetStatusBadge } from '@/components/assets/badges';
import { Badge } from '@/components/ui/Badge';
import { StockAssetsPanel } from '@/components/stock/StockAssetsPanel';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { SearchInput } from '@/components/ui/SearchInput';
import { StatTile } from '@/components/ui/StatTile';
import { useResource } from '@/hooks/useResource';
import { formatDate } from '@/lib/format';

/** Jeda penyegaran otomatis (hampir real-time; berhenti saat tab tidak terlihat atau dijeda). */
const REFRESH_MS = 10_000;
const TABS = ['PRODUCTS', 'OUT', 'PREPARED'] as const;
type Tab = (typeof TABS)[number];

const matches = (a: LiveStockAssetDto, q: string) =>
  [a.assetCode, a.productName, a.orderNumber, a.customerName, a.pickListNumber]
    .filter(Boolean)
    .some((v) => (v as string).toLowerCase().includes(q));

/**
 * Stok gudang langsung: aset ready di gudang vs sedang keluar, per produk, beserta pesanan yang
 * memegang aset. Data disegarkan otomatis tiap 10 detik; dapat dijeda atau disegarkan manual.
 */
export function StockLivePage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('PRODUCTS');
  const [q, setQ] = useState('');
  const [live, setLive] = useState(true);
  // Klik angka ready/dipersiapkan/keluar membuka panel daftar aset di sisi kanan.
  const [selected, setSelected] = useState<{
    productId: string;
    productName: string;
    bucket: LiveStockBucket;
  } | null>(null);
  const { data, loading, reload } = useResource(() => getLiveStock(api), 'stock-live');

  const tick = useEffectEvent(() => {
    if (!document.hidden) reload();
  });
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(tick, REFRESH_MS);
    return () => clearInterval(timer);
  }, [live]);

  const needle = q.trim().toLowerCase();
  const today = new Date().toISOString().slice(0, 10);
  const holding = data?.holding ?? [];
  const out = holding.filter((a) => a.bucket === 'OUT');
  const prepared = holding.filter((a) => a.bucket === 'PREPARED');
  const counts: Record<Tab, number> = {
    PRODUCTS: data?.products.length ?? 0,
    OUT: out.length,
    PREPARED: prepared.length,
  };
  const products = (data?.products ?? []).filter(
    (p) => !needle || p.productName.toLowerCase().includes(needle),
  );
  const rows = (tab === 'OUT' ? out : prepared).filter((a) => !needle || matches(a, needle));
  const updated = data ? new Date(data.generatedAt).toLocaleTimeString() : null;

  const pick = (p: LiveStockProductDto, bucket: LiveStockBucket) =>
    setSelected((cur) =>
      cur?.productId === p.productId && cur.bucket === bucket
        ? null
        : { productId: p.productId, productName: p.productName, bucket },
    );
  const qtyCell = (p: LiveStockProductDto, bucket: LiveStockBucket, n: number, tone?: string) => {
    const active = selected?.productId === p.productId && selected.bucket === bucket;
    return (
      <td>
        <button
          type="button"
          className="ev-qty ev-qty--link"
          data-tone={tone}
          data-active={active}
          aria-pressed={active}
          disabled={n === 0}
          onClick={() => pick(p, bucket)}
        >
          {n}
        </button>
      </td>
    );
  };

  return (
    <PageCard>
      <PageHeader title={t('stock.title')} subtitle={t('stock.subtitle')}>
        <span className="ev-live" data-live={live}>
          <span className="ev-live__dot" aria-hidden="true" />
          {live ? t('stock.live') : t('stock.paused')}
          {updated && <span className="ev-hint">{t('stock.updated', { time: updated })}</span>}
        </span>
        <Button
          size="sm"
          variant="ghost"
          icon={live ? mdiPause : mdiPlay}
          onClick={() => setLive((v) => !v)}
        >
          {live ? t('stock.pause') : t('stock.resume')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={mdiRefresh}
          loading={loading && !!data}
          onClick={reload}
        >
          {t('stock.refresh')}
        </Button>
      </PageHeader>

      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="ev-stats">
            <StatTile title={t('stock.total')} value={data.totals.total} />
            <StatTile
              title={t('stock.ready')}
              value={data.totals.ready}
              hint={t('stock.readyHint')}
            />
            <StatTile
              title={t('stock.prepared')}
              value={data.totals.prepared}
              hint={t('stock.preparedHint')}
            />
            <StatTile title={t('stock.out')} value={data.totals.out} hint={t('stock.outHint')} />
            <StatTile
              title={t('stock.unavailable')}
              value={data.totals.unavailable}
              hint={t('stock.unavailableHint')}
              alert={data.totals.unavailable > 0}
            />
          </div>

          <div className="ev-filters">
            <SearchInput value={q} onChange={setQ} />
          </div>
          <div role="tablist" className="tabs tabs-border ev-tabs">
            {TABS.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                className={`tab ${tab === key ? 'tab-active' : ''}`.trim()}
                aria-selected={tab === key}
                onClick={() => setTab(key)}
              >
                {t(`stock.tabs.${key}`)}
                <span className="ev-tabs__count">{counts[key]}</span>
              </button>
            ))}
          </div>

          {tab === 'PRODUCTS' ? (
            <>
              <div className="ev-table-wrap">
                <table className="table">
                  <thead className="ev-table__head">
                    <tr>
                      <th>{t('stock.product')}</th>
                      <th>{t('stock.ready')}</th>
                      <th>{t('stock.prepared')}</th>
                      <th>{t('stock.out')}</th>
                      <th>{t('stock.unavailable')}</th>
                      <th>{t('stock.total')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr
                        key={p.productId}
                        className="ev-table__row"
                        data-selected={selected?.productId === p.productId}
                      >
                        <td>{p.productName}</td>
                        {qtyCell(p, 'READY', p.ready, 'ready')}
                        {qtyCell(p, 'PREPARED', p.prepared)}
                        {qtyCell(p, 'OUT', p.out, p.out > 0 ? 'out' : undefined)}
                        {qtyCell(p, 'UNAVAILABLE', p.unavailable)}
                        <td className="ev-qty">{p.total}</td>
                        <td className="ev-progress-cell">
                          <progress
                            className="progress progress-success"
                            aria-label={t('stock.ready')}
                            value={p.ready}
                            max={p.total}
                          />
                        </td>
                      </tr>
                    ))}
                    {products.length === 0 && (
                      <tr>
                        <td colSpan={7} className="ev-table__empty">
                          {t('common.empty')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {selected && (
                <StockAssetsPanel
                  key={`${selected.productId}|${selected.bucket}`}
                  productId={selected.productId}
                  productName={selected.productName}
                  bucket={selected.bucket}
                  version={data.generatedAt}
                  onClose={() => setSelected(null)}
                />
              )}
            </>
          ) : (
            <div className="ev-table-wrap">
              <table className="table">
                <thead className="ev-table__head">
                  <tr>
                    <th>{t('stock.asset')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('stock.order')}</th>
                    <th>{t('stock.pickList')}</th>
                    <th>{t('stock.dueDate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.assetId} className="ev-table__row">
                      <td>
                        <Link className="ev-link" to={`/assets/${a.assetId}`}>
                          {a.assetCode}
                        </Link>
                        <span className="ev-table__hint ev-table__hint--block">
                          {a.productName}
                        </span>
                      </td>
                      <td>
                        <AssetStatusBadge status={a.status} />
                      </td>
                      <td>
                        {a.orderId ? (
                          <>
                            <Link className="ev-link" to={`/orders/${a.orderId}`}>
                              {a.orderNumber}
                            </Link>
                            <span className="ev-table__hint ev-table__hint--block">
                              {a.customerName}
                            </span>
                          </>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        {a.pickListId ? (
                          <Link className="ev-link" to={`/warehouse/pick-lists/${a.pickListId}`}>
                            {a.pickListNumber}
                          </Link>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        {a.dueDate ? formatDate(a.dueDate) : '-'}
                        {a.bucket === 'OUT' && a.dueDate && a.dueDate < today && (
                          <Badge variant="error">{t('stock.overdue')}</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="ev-table__empty">
                        {t('stock.noneIn')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </PageCard>
  );
}
