import { useEffect, useState, type ReactNode } from 'react';
import {
  mdiFileDocumentOutline,
  mdiPencil,
  mdiQrcodeEdit,
  mdiSwapHorizontal,
  mdiWrench,
} from '@mdi/js';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  getAsset,
  getAssetHistory,
  getAssetLabelsPdf,
  getAssetPhoto,
  listAssetPhotos,
  uploadAssetPhoto,
  getAssetQrImage,
  listLocations,
  listProducts,
  regenerateAssetQr,
} from '@eventra/api-client';
import type { AssetEventDto } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { AssetChangeModal } from '@/components/assets/AssetChangeModal';
import { AssetMetrics } from '@/components/assets/AssetMetrics';
import { AssetRentalHistory } from '@/components/assets/AssetRentalHistory';
import { AssetServiceHistory } from '@/components/assets/AssetServiceHistory';
import { AssetModal } from '@/components/assets/AssetModal';
import { AssetStatusBadge, ConditionBadge } from '@/components/assets/badges';
import { Button } from '@/components/ui/Button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { PhotoStrip } from '@/components/ui/PhotoStrip';
import { PageCard } from '@/components/ui/PageCard';
import { useResource } from '@/hooks/useResource';
import { downloadBlob } from '@/lib/download';
import { formatDate, formatDateTime, formatRupiah } from '@/lib/format';
import { notify } from '@/lib/notifications';

type Dialog = 'edit' | 'condition' | 'status' | 'regenerate' | 'rentals' | 'services' | null;

/** Gambar QR diambil lewat Axios (butuh token), lalu ditampilkan dari object URL. */
function QrImage({ assetId, version }: { assetId: string; version: number }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    getAssetQrImage(api, assetId).then(
      (blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, version]);

  if (!url) return <Loading />;
  return <img className="ev-qr__image" src={url} alt={t('assets.detail.qr')} />;
}

/** "dari → ke"; bila nilai awal kosong (mis. aset baru dibuat) cukup nilai akhirnya. */
const change = (from: string | null | undefined, to: string | null | undefined): string =>
  from ? `${from} → ${to ?? '-'}` : `→ ${to ?? '-'}`;

function eventSummary(event: AssetEventDto, t: TFunction): string[] {
  const parts: string[] = [];
  if (event.fromStatus || event.toStatus) {
    parts.push(
      change(
        event.fromStatus && t(`assets.statuses.${event.fromStatus}`),
        event.toStatus && t(`assets.statuses.${event.toStatus}`),
      ),
    );
  }
  if (event.fromCondition || event.toCondition) {
    parts.push(
      change(
        event.fromCondition && t(`assets.conditions.${event.fromCondition}`),
        event.toCondition && t(`assets.conditions.${event.toCondition}`),
      ),
    );
  }
  if (event.fromLocation || event.toLocation) {
    parts.push(change(event.fromLocation, event.toLocation));
  }
  if (event.type === 'UPDATED' && event.note) {
    parts.push(t('assets.eventFields', { fields: event.note }));
  } else if (event.type === 'RECEIVED' && event.receiptNumber) {
    parts.push(`${event.receiptNumber} (${t(`receipts.sources.${event.note ?? 'OTHER'}`)})`);
  } else if (event.note) {
    parts.push(event.note);
  }
  return parts;
}

/** Bagian detail: kartu halaman (halaman penuh) atau panel bergaris (di dalam dialog). */
function Panel({ embedded, children }: { embedded: boolean; children: ReactNode }) {
  return embedded ? (
    <section className="ev-assetdetail__panel">{children}</section>
  ) : (
    <PageCard>{children}</PageCard>
  );
}

interface AssetDetailViewProps {
  id: string;
  /** Tampil di dalam dialog: tanpa kartu/judul halaman. */
  embedded?: boolean;
  /** Dipanggil setelah data aset berubah (ubah/kondisi/status/QR). */
  onChanged?: () => void;
}

export function AssetDetailView({ id, embedded = false, onChanged }: AssetDetailViewProps) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canWrite = can('asset.write');
  const canStatus = can('asset.status');
  const canSeeCost = can('asset.cost.read');
  const canSeeRentals = can('order.read');
  const canSeeServices = can('service.read');

  const [dialog, setDialog] = useState<Dialog>(null);
  const [qrVersion, setQrVersion] = useState(0);

  const asset = useResource(() => getAsset(api, id), `asset-${id}`);
  const history = useResource(() => getAssetHistory(api, id), `history-${id}`);
  const products = useResource(
    () => (canWrite ? listProducts(api, { pageSize: 100 }) : Promise.resolve(undefined)),
    'products',
  );
  const locations = useResource(() => listLocations(api), 'locations');
  const photos = useResource(() => listAssetPhotos(api, id), `photos-${id}`);

  const reload = () => {
    asset.reload();
    history.reload();
    onChanged?.();
  };
  const a = asset.data;

  const downloadLabel = async () => {
    try {
      downloadBlob(await getAssetLabelsPdf(api, [id]), `${a?.code ?? 'asset'}-label.pdf`);
      notify('success', t('assets.labelsDownloaded'));
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  const regenerate = async () => {
    try {
      await regenerateAssetQr(api, id);
      notify('success', t('assets.detail.regenerated'));
      setQrVersion((v) => v + 1);
      onChanged?.();
      setDialog(null);
      history.reload();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  if (asset.loading && !a) return <Loading />;
  if (!a) return null;

  const retired = a.status === 'RETIRED';
  const info: [string, string][] = [
    [t('assets.product'), `${a.product.name} (${a.product.category.name})`],
    [t('assets.serial'), a.serial ?? '-'],
    [t('assets.location'), a.location?.name ?? '-'],
    [t('assets.supplier'), a.supplier ?? '-'],
    [t('assets.purchaseDate'), a.purchaseDate ? formatDate(a.purchaseDate) : '-'],
    ...(canSeeCost
      ? ([
          [
            t('assets.purchasePrice'),
            a.purchasePrice === null || a.purchasePrice === undefined
              ? '-'
              : formatRupiah(a.purchasePrice),
          ],
        ] as [string, string][])
      : []),
    [t('assets.receipt'), a.receiptNumber ?? '-'],
    [t('assets.notes'), a.notes ?? '-'],
  ];

  return (
    <div className="ev-detail ev-assetdetail">
      <Panel embedded={embedded}>
        <div className="ev-assetdetail__head">
          <div className="ev-detail__badges">
            <AssetStatusBadge status={a.status} />
            <ConditionBadge condition={a.condition} />
          </div>
          <div className="ev-detail__actions">
            {canWrite && !retired && (
              <Button
                size="sm"
                variant="primary"
                icon={mdiPencil}
                onClick={() => setDialog('edit')}
              >
                {t('common.edit')}
              </Button>
            )}
            {canStatus && !retired && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={mdiWrench}
                  onClick={() => setDialog('condition')}
                >
                  {t('assets.detail.changeCondition')}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={mdiSwapHorizontal}
                  onClick={() => setDialog('status')}
                >
                  {t('assets.detail.changeStatus')}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="ev-detail__grid">
          <section>
            <h2 className="ev-section-title">{t('assets.detail.info')}</h2>
            <dl className="ev-dl">
              {info.map(([label, value]) => (
                <div key={label} className="ev-dl__row">
                  <dt className="ev-dl__term">{label}</dt>
                  <dd className="ev-dl__desc">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="ev-qr">
            <h2 className="ev-section-title">{t('assets.detail.qr')}</h2>
            <QrImage assetId={id} version={qrVersion} />
            <p className="ev-qr__hint">{t('assets.detail.qrHint')}</p>
            <div className="ev-qr__actions">
              <Button
                size="sm"
                variant="secondary"
                icon={mdiFileDocumentOutline}
                onClick={downloadLabel}
              >
                {t('assets.detail.downloadLabel')}
              </Button>
              {canWrite && !retired && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={mdiQrcodeEdit}
                  onClick={() => setDialog('regenerate')}
                >
                  {t('assets.detail.regenerateQr')}
                </Button>
              )}
            </div>
          </section>
        </div>
      </Panel>

      <Panel embedded={embedded}>
        <PhotoStrip
          title={t('assets.photos.title')}
          hint={t('assets.photos.hint')}
          photoIds={photos.data?.map((p) => p.id) ?? []}
          load={(photoId) => getAssetPhoto(api, id, photoId)}
          onAdd={
            canStatus && !retired
              ? async (file) => {
                  await uploadAssetPhoto(api, id, file);
                  notify('success', t('common.saved'));
                  photos.reload();
                  reload();
                }
              : undefined
          }
        />
      </Panel>

      <AssetMetrics
        assetId={id}
        embedded={embedded}
        onOpenRentals={canSeeRentals ? () => setDialog('rentals') : undefined}
        onOpenServices={canSeeServices ? () => setDialog('services') : undefined}
      />

      <Panel embedded={embedded}>
        <h2 className="ev-section-title">{t('assets.detail.history')}</h2>
        {history.loading && !history.data ? (
          <Loading />
        ) : (
          <ul className="ev-timeline">
            {history.data?.map((event) => (
              <li key={event.id} className="ev-timeline__item">
                <p className="ev-timeline__title">{t(`assets.events.${event.type}`)}</p>
                {eventSummary(event, t).map((line) => (
                  <p key={line} className="ev-timeline__text">
                    {line}
                  </p>
                ))}
                <p className="ev-table__hint">
                  {formatDateTime(event.createdAt)}
                  {event.actor ? ` · ${t('assets.eventBy', { actor: event.actor })}` : ''}
                </p>
              </li>
            ))}
            {history.data?.length === 0 && <li>{t('assets.detail.noHistory')}</li>}
          </ul>
        )}
      </Panel>

      {dialog === 'edit' && products.data && locations.data && (
        <AssetModal
          asset={a}
          products={products.data.items}
          locations={locations.data}
          canSeeCost={canSeeCost}
          onClose={() => setDialog(null)}
          onChanged={reload}
        />
      )}
      {(dialog === 'condition' || dialog === 'status') && (
        <AssetChangeModal
          kind={dialog}
          asset={a}
          onClose={() => setDialog(null)}
          onChanged={reload}
        />
      )}
      {dialog === 'rentals' && (
        <Modal open wide title={t('assets.history.rentals')} onClose={() => setDialog(null)}>
          <AssetRentalHistory assetId={id} />
        </Modal>
      )}
      {dialog === 'services' && (
        <Modal open wide title={t('assets.history.services')} onClose={() => setDialog(null)}>
          <AssetServiceHistory assetId={id} />
        </Modal>
      )}
      {dialog === 'regenerate' && (
        <ConfirmModal
          title={t('assets.detail.regenerateTitle')}
          message={t('assets.detail.regenerateMessage')}
          confirmLabel={t('assets.detail.regenerateQr')}
          onConfirm={regenerate}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
