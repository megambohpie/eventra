import { useEffect, useState } from 'react';
import {
  mdiArrowLeft,
  mdiFileDocumentOutline,
  mdiPencil,
  mdiQrcodeEdit,
  mdiSwapHorizontal,
  mdiWrench,
} from '@mdi/js';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import {
  getAsset,
  getAssetHistory,
  getAssetLabelsPdf,
  getAssetQrImage,
  listLocations,
  listProducts,
  regenerateAssetQr,
} from '@eventra/api-client';
import type { AssetEventDto } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { AssetChangeModal } from '@/components/assets/AssetChangeModal';
import { AssetModal } from '@/components/assets/AssetModal';
import { AssetStatusBadge, ConditionBadge } from '@/components/assets/badges';
import { Button } from '@/components/ui/Button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Icon } from '@/components/ui/Icon';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { useResource } from '@/hooks/useResource';
import { downloadBlob } from '@/lib/download';
import { formatDate, formatDateTime, formatRupiah } from '@/lib/format';
import { notify } from '@/lib/notifications';

type Dialog = 'edit' | 'condition' | 'status' | 'regenerate' | null;

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

function eventSummary(event: AssetEventDto, t: TFunction): string[] {
  const parts: string[] = [];
  if (event.fromStatus || event.toStatus) {
    parts.push(
      t('assets.eventFromTo', {
        from: event.fromStatus ? t(`assets.statuses.${event.fromStatus}`) : '-',
        to: event.toStatus ? t(`assets.statuses.${event.toStatus}`) : '-',
      }),
    );
  }
  if (event.fromCondition || event.toCondition) {
    parts.push(
      t('assets.eventFromTo', {
        from: event.fromCondition ? t(`assets.conditions.${event.fromCondition}`) : '-',
        to: event.toCondition ? t(`assets.conditions.${event.toCondition}`) : '-',
      }),
    );
  }
  if (event.fromLocation || event.toLocation) {
    parts.push(
      t('assets.eventFromTo', { from: event.fromLocation ?? '-', to: event.toLocation ?? '-' }),
    );
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

export function AssetDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { can } = useAuth();
  const canWrite = can('asset.write');
  const canStatus = can('asset.status');
  const canSeeCost = can('asset.cost.read');

  const [dialog, setDialog] = useState<Dialog>(null);
  const [qrVersion, setQrVersion] = useState(0);

  const asset = useResource(() => getAsset(api, id), `asset-${id}`);
  const history = useResource(() => getAssetHistory(api, id), `history-${id}`);
  const products = useResource(
    () => (canWrite ? listProducts(api, { pageSize: 100 }) : Promise.resolve(undefined)),
    'products',
  );
  const locations = useResource(() => listLocations(api), 'locations');

  const reload = () => {
    asset.reload();
    history.reload();
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
    <div className="ev-detail">
      <PageCard>
        <PageHeader title={a.code} subtitle={t('assets.detail.title')}>
          <Link to="/assets" className="btn btn-ghost btn-sm">
            <Icon path={mdiArrowLeft} />
            {t('common.back')}
          </Link>
        </PageHeader>
        <div className="ev-detail__badges">
          <AssetStatusBadge status={a.status} />
          <ConditionBadge condition={a.condition} />
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
            <p className="ev-table__hint">{t('assets.detail.qrHint')}</p>
            <div className="ev-detail__actions">
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

        <div className="ev-detail__actions">
          {canWrite && !retired && (
            <Button size="sm" variant="primary" icon={mdiPencil} onClick={() => setDialog('edit')}>
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
      </PageCard>

      <PageCard>
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
      </PageCard>

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
