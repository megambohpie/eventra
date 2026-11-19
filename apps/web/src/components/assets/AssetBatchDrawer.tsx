import { useTranslation } from 'react-i18next';
import { getAssetBatches, getBatchPhoto, uploadBatchPhoto } from '@eventra/api-client';
import type { AssetGroupQuery } from '@eventra/shared';
import { api } from '@/api';
import { AssetUnitTable } from '@/components/assets/AssetUnitTable';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { PhotoStrip } from '@/components/ui/PhotoStrip';
import { useAuth } from '@/auth/AuthProvider';
import { useResource } from '@/hooks/useResource';
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
  const { data, reload } = useResource(
    () => getAssetBatches(api, productId, filters),
    `asset-batch|${productId}|${JSON.stringify(filters)}`,
  );
  const batch = data?.find((b) => b.date === date);

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
            <AssetUnitTable
              assets={batch.assets.map((a) => ({
                id: a.id,
                code: a.code,
                serial: a.serial,
                condition: a.condition,
                status: a.status,
                locationName: a.location?.name ?? null,
                photoCount: a.photoCount,
                needsAttention: a.needsAttention,
              }))}
              onChanged={reload}
            />
          </div>
        )}
      </Modal>
    </>
  );
}
