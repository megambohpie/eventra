import { useRef, useState } from 'react';
import { mdiAlertCircleOutline, mdiImageOutline, mdiPrinter } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import {
  getAssetBatches,
  getAssetLabelsPdf,
  getBatchPhoto,
  uploadBatchPhoto,
} from '@eventra/api-client';
import { MAX_LABELS, type AssetGroupQuery } from '@eventra/shared';
import { api } from '@/api';
import { AssetDetailDialog } from '@/components/assets/AssetDetailDialog';
import { AssetStatusBadge, ConditionBadge } from '@/components/assets/badges';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { PhotoStrip } from '@/components/ui/PhotoStrip';
import { useAuth } from '@/auth/AuthProvider';
import { useResource } from '@/hooks/useResource';
import { downloadBlob, timestampedFilename } from '@/lib/download';
import { formatDate } from '@/lib/format';
import { notify } from '@/lib/notifications';

interface AssetBatchDrawerProps {
  productId: string;
  productName: string;
  /** Tanggal perolehan kelompok yang dibuka. */
  date: string;
  filters: Omit<AssetGroupQuery, 'page' | 'pageSize'>;
  onClose: () => void;
}

/** Panel kanan: unit fisik satu kelompok pembelian. Klik baris = detail aset (dialog). */
export function AssetBatchDrawer({
  productId,
  productName,
  date,
  filters,
  onClose,
}: AssetBatchDrawerProps) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<{ id: string; code: string } | null>(null);
  const { data, reload } = useResource(
    () => getAssetBatches(api, productId, filters),
    `asset-batch|${productId}|${JSON.stringify(filters)}`,
  );
  const batch = data?.find((b) => b.date === date);
  const ids = batch?.assets.map((a) => a.id) ?? [];
  const all = ids.length > 0 && ids.every((id) => selected.includes(id));

  // Indeks centang terakhir: Shift+klik mencentang/mencabut seluruh rentang dari sana.
  const lastIndex = useRef<number | null>(null);
  const clickRow = (index: number, shiftKey: boolean) => {
    const id = ids[index];
    if (!id) return;
    const on = !selected.includes(id);
    if (shiftKey && lastIndex.current !== null) {
      const from = Math.min(lastIndex.current, index);
      const to = Math.max(lastIndex.current, index);
      toggle(ids.slice(from, to + 1), on);
    } else {
      toggle([id], on);
    }
    lastIndex.current = index;
  };

  const toggle = (list: string[], on: boolean) =>
    setSelected((prev) =>
      on ? [...new Set([...prev, ...list])] : prev.filter((x) => !list.includes(x)),
    );

  const printLabels = async () => {
    if (selected.length > MAX_LABELS) {
      notify('error', t('assets.maxLabels', { max: MAX_LABELS }));
      return;
    }
    try {
      downloadBlob(
        await getAssetLabelsPdf(api, selected),
        timestampedFilename('eventra-qr-labels', 'pdf'),
      );
      notify('success', t('assets.labelsDownloaded'));
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  return (
    <>
      <Modal open side title={productName} onClose={onClose}>
        {!batch ? (
          <Loading />
        ) : (
          <div className="ev-batchdrawer">
            <p className="ev-batch__title">
              {t('assets.batch.title', { date: formatDate(batch.date) })}
              <span className="ev-batch__qty">
                {t('assets.batch.units', { count: batch.quantity })}
              </span>
            </p>
            <PhotoStrip
              title={t('assets.photos.batchTitle')}
              hint={t('assets.photos.batchHint')}
              photoIds={batch.photos.map((p) => p.id)}
              load={(photoId) => getBatchPhoto(api, productId, photoId)}
              onAdd={
                can('asset.status')
                  ? async (file) => {
                      await uploadBatchPhoto(api, productId, batch.date, file);
                      notify('success', t('common.saved'));
                      reload();
                    }
                  : undefined
              }
            />
            <div className="ev-batchdrawer__bar">
              <Button
                size="sm"
                variant="secondary"
                icon={mdiPrinter}
                disabled={selected.length === 0}
                onClick={printLabels}
              >
                {t('assets.printLabels', { count: selected.length })}
              </Button>
            </div>
            <div className="ev-table-wrap">
              <table className="table table-sm">
                <thead className="ev-table__head">
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        aria-label={t('common.all')}
                        checked={all}
                        onChange={() => toggle(ids, !all)}
                      />
                    </th>
                    <th>{t('assets.code')}</th>
                    <th>{t('assets.serial')}</th>
                    <th>{t('assets.condition')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('assets.location')}</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.assets.map((asset, index) => (
                    <tr
                      key={asset.id}
                      className="ev-table__row ev-table__row--click"
                      onClick={() => setDetail({ id: asset.id, code: asset.code })}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          aria-label={t('assets.selectAsset', { code: asset.code })}
                          checked={selected.includes(asset.id)}
                          onChange={() => undefined}
                          onClick={(e) => clickRow(index, e.shiftKey)}
                        />
                      </td>
                      <td>
                        <strong>{asset.code}</strong>
                        {asset.photoCount > 0 && (
                          <Icon
                            path={mdiImageOutline}
                            className="ev-icon--muted"
                            title={t('assets.photos.count', { count: asset.photoCount })}
                          />
                        )}
                        {asset.needsAttention && (
                          <Icon
                            path={mdiAlertCircleOutline}
                            className="ev-icon--warning"
                            title={t('assets.attention')}
                          />
                        )}
                      </td>
                      <td>{asset.serial ?? '-'}</td>
                      <td>
                        <ConditionBadge condition={asset.condition} />
                      </td>
                      <td>
                        <AssetStatusBadge status={asset.status} />
                      </td>
                      <td>{asset.location?.name ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
