import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getLiveStockAssets } from '@eventra/api-client';
import type { LiveStockBucket } from '@eventra/shared';
import { api } from '@/api';
import { AssetDetailDialog } from '@/components/assets/AssetDetailDialog';
import { ConditionBadge } from '@/components/assets/badges';
import { Badge } from '@/components/ui/Badge';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { useResource } from '@/hooks/useResource';
import { formatDate } from '@/lib/format';

interface StockAssetsPanelProps {
  productId: string;
  productName: string;
  bucket: LiveStockBucket;
  /** Berubah setiap data stok disegarkan; daftar ikut dimuat ulang agar tetap langsung. */
  version: string;
  onClose: () => void;
}

/**
 * Drawer kanan stok langsung: aset satu produk pada satu kelompok. Kolom ringkas: kode aset, pesanan,
 * tanggal keluar, tanggal kembali, dan kondisi (ready/tidak tersedia tidak punya pesanan sehingga
 * hanya kode dan kondisi). Klik baris = detail aset (dialog).
 */
export function StockAssetsPanel({
  productId,
  productName,
  bucket,
  version,
  onClose,
}: StockAssetsPanelProps) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<{ id: string; code: string } | null>(null);
  const { data, loading, reload } = useResource(
    () => getLiveStockAssets(api, { productId, bucket }),
    `stock-assets|${productId}|${bucket}|${version}`,
  );

  const needle = q.trim().toLowerCase();
  const today = new Date().toISOString().slice(0, 10);
  const holdsOrder = bucket === 'PREPARED' || bucket === 'OUT';
  const rows = (data ?? []).filter(
    (a) =>
      !needle ||
      [a.assetCode, a.orderNumber, a.customerName]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(needle)),
  );

  return (
    <>
      <Modal open side title={productName} onClose={onClose}>
        {!data && loading ? (
          <Loading />
        ) : (
          <div className="ev-batchdrawer">
            <p className="ev-batch__title">
              {t(`stock.buckets.${bucket}`)}
              <span className="ev-batch__qty">
                {t('assets.batch.units', { count: data?.length ?? 0 })}
              </span>
            </p>
            <SearchInput value={q} onChange={setQ} />
            {rows.length === 0 ? (
              <p className="ev-hint">{t('stock.noneIn')}</p>
            ) : (
              <div className="ev-table-wrap">
                <table className="table table-sm">
                  <thead className="ev-table__head">
                    <tr>
                      <th>{t('assets.code')}</th>
                      {holdsOrder && (
                        <>
                          <th className="ev-unit-order">{t('stock.order')}</th>
                          <th>{t('stock.outDate')}</th>
                          <th>{t('stock.returnDate')}</th>
                        </>
                      )}
                      <th>{t('assets.condition')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr
                        key={a.assetId}
                        className="ev-table__row ev-table__row--click"
                        onClick={() => setDetail({ id: a.assetId, code: a.assetCode })}
                      >
                        <td>
                          <strong>{a.assetCode}</strong>
                        </td>
                        {holdsOrder && (
                          <>
                            <td className="ev-unit-order" onClick={(e) => e.stopPropagation()}>
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
                              {a.outDate ? formatDate(a.outDate) : '-'}
                              {a.outPlanned && (
                                <span className="ev-table__hint ev-table__hint--block">
                                  {t('stock.planned')}
                                </span>
                              )}
                            </td>
                            <td>
                              {a.dueDate ? formatDate(a.dueDate) : '-'}
                              {a.bucket === 'OUT' && a.dueDate && a.dueDate < today && (
                                <Badge variant="error">{t('stock.overdue')}</Badge>
                              )}
                            </td>
                          </>
                        )}
                        <td>
                          <ConditionBadge condition={a.condition} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
      {detail && (
        <AssetDetailDialog
          id={detail.id}
          code={detail.code}
          onClose={() => setDetail(null)}
          onChanged={reload}
        />
      )}
    </>
  );
}
