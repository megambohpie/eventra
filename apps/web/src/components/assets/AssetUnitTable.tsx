import { useRef, useState, type ReactNode } from 'react';
import { mdiAlertCircleOutline, mdiImageOutline, mdiPrinter } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { getAssetLabelsPdf } from '@eventra/api-client';
import { MAX_LABELS, type AssetCondition, type AssetStatus } from '@eventra/shared';
import { api } from '@/api';
import { AssetDetailDialog } from '@/components/assets/AssetDetailDialog';
import { AssetStatusBadge, ConditionBadge } from '@/components/assets/badges';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { downloadBlob, timestampedFilename } from '@/lib/download';
import { notify } from '@/lib/notifications';

/** Baris unit aset yang ditampilkan; cukup bagian yang dipakai tabel (bukan seluruh AssetDto). */
export interface AssetUnitRow {
  id: string;
  code: string;
  serial: string | null;
  condition: AssetCondition;
  status: AssetStatus;
  locationName: string | null;
  photoCount: number;
  needsAttention: boolean;
}

interface AssetUnitTableProps {
  assets: AssetUnitRow[];
  /** Kolom tambahan di akhir (mis. pesanan pemegang aset). */
  extraHeader?: ReactNode;
  renderExtra?: (asset: AssetUnitRow) => ReactNode;
  /** Dipanggil setelah detail aset diubah (mis. kondisi/status) agar daftar dimuat ulang. */
  onChanged?: () => void;
}

/**
 * Tabel unit aset seperti di halaman Aset: centang (Shift+klik untuk rentang), cetak label QR,
 * kode/serial/kondisi/status/lokasi, dan klik baris membuka detail aset sebagai dialog.
 */
export function AssetUnitTable({
  assets,
  extraHeader,
  renderExtra,
  onChanged,
}: AssetUnitTableProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<{ id: string; code: string } | null>(null);
  const ids = assets.map((a) => a.id);
  const all = ids.length > 0 && ids.every((id) => selected.includes(id));

  const toggle = (list: string[], on: boolean) =>
    setSelected((prev) =>
      on ? [...new Set([...prev, ...list])] : prev.filter((x) => !list.includes(x)),
    );

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
              {extraHeader}
            </tr>
          </thead>
          <tbody>
            {assets.map((asset, index) => (
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
                <td>{asset.locationName ?? '-'}</td>
                {renderExtra?.(asset)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail && (
        <AssetDetailDialog
          id={detail.id}
          code={detail.code}
          onClose={() => setDetail(null)}
          onChanged={onChanged}
        />
      )}
    </>
  );
}
