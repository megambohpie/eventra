import { useRef, useState, type FormEvent } from 'react';
import { mdiBarcodeScan, mdiCancel, mdiTruckDelivery } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import {
  ApiRequestError,
  cancelPickListById,
  checkoutPickList,
  getPickList,
  removePickItem,
  scanPickList,
} from '@eventra/api-client';
import type { PickListDto } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { AssetStatusBadge, ConditionBadge } from '@/components/assets/badges';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { FormField } from '@/components/ui/FormField';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { DocumentsPanel } from '@/components/warehouse/DocumentsPanel';
import { CountedLines } from '@/components/warehouse/CountedLines';
import { ItemPhotos } from '@/components/warehouse/ItemPhotos';
import { ReturnPanel } from '@/components/warehouse/ReturnPanel';
import { PickItemStatusBadge, PickListStatusBadge } from '@/components/warehouse/badges';
import { useResource } from '@/hooks/useResource';
import { formatDate, formatDateTime } from '@/lib/format';
import { notify } from '@/lib/notifications';

type Mode = 'PICK' | 'VERIFY';
type Dialog = 'checkout' | 'cancel' | null;
const ASSET_CODE = /^AST-[A-Z0-9-]+$/i;

export function PickListDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { can } = useAuth();
  const canWrite = can('warehouse.write');
  const { data: pick, loading, reload } = useResource(() => getPickList(api, id), id);

  if (loading && !pick) return <Loading />;
  if (!pick) {
    return (
      <PageCard>
        <p>{t('common.empty')}</p>
        <Link className="btn btn-ghost btn-sm" to="/warehouse">
          {t('common.back')}
        </Link>
      </PageCard>
    );
  }
  return <Detail pick={pick} canWrite={canWrite} canSign={can('handover.sign')} reload={reload} />;
}

interface DetailProps {
  pick: PickListDto;
  canWrite: boolean;
  canSign: boolean;
  reload: () => void;
}

function Detail({ pick, canWrite, canSign, reload }: DetailProps) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('PICK');
  const [value, setValue] = useState('');
  // Aksesori tambahan (include): aset di luar kebutuhan pesanan, mis. tiang sangga atau katrol.
  const [extra, setExtra] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  const preparing = pick.status === 'OPEN' || pick.status === 'VERIFIED';
  const awaitingReturn = pick.status === 'DISPATCHED' || pick.status === 'RETURN_ISSUE';
  const afterDispatch = awaitingReturn || pick.status === 'RETURNED';
  const scheduled = pick.orderStatus === 'CONFIRMED' || pick.orderStatus === 'SCHEDULED';

  const submitScan = async (event: FormEvent) => {
    event.preventDefault();
    const raw = value.trim();
    if (!raw) return;
    const manual = mode === 'PICK' && ASSET_CODE.test(raw);
    setBusy(true);
    try {
      const out = await scanPickList(api, pick.id, {
        action: mode,
        ...(manual ? { assetCode: raw.toUpperCase() } : { qrToken: raw }),
        ...(mode === 'PICK' && extra ? { extra: true } : {}),
      });
      setFeedback({
        ok: true,
        text: t(mode === 'PICK' ? 'warehouse.detail.pickedOk' : 'warehouse.detail.verifiedOk', {
          code: out.item.assetCode,
        }),
      });
      setValue('');
      reload();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setFeedback({
          ok: false,
          text: t(`errors.${error.code}`, { defaultValue: error.message }),
        });
      }
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  };

  const release = (itemId: string) => async () => {
    try {
      await removePickItem(api, pick.id, itemId);
      notify('success', t('warehouse.detail.removed'));
      reload();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  const act = (action: () => Promise<unknown>, doneKey: string) => async () => {
    try {
      await action();
      notify('success', t(doneKey));
      setDialog(null);
      reload();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  return (
    <>
      <PageCard>
        <PageHeader title={pick.number} subtitle={`${pick.orderNumber} · ${pick.customerName}`}>
          <Link className="btn btn-ghost btn-sm" to="/warehouse">
            {t('common.back')}
          </Link>
          <Link className="btn btn-ghost btn-sm" to={`/orders/${pick.orderId}`}>
            {t('warehouse.openOrder')}
          </Link>
        </PageHeader>

        <div className="ev-detail__badges">
          <PickListStatusBadge status={pick.status} />
          <Badge variant="neutral">
            {t('warehouse.progress')}: {pick.verified} / {pick.required}
          </Badge>
        </div>

        <dl className="ev-dl">
          <div className="ev-dl__row">
            <dt className="ev-dl__term">{t('warehouse.period')}</dt>
            <dd className="ev-dl__desc">
              {formatDate(pick.startDate)} – {formatDate(pick.endDate)}
            </dd>
          </div>
          <div className="ev-dl__row">
            <dt className="ev-dl__term">{t('orders.eventLocation')}</dt>
            <dd className="ev-dl__desc">{pick.eventLocation}</dd>
          </div>
          {pick.dispatchedAt && (
            <div className="ev-dl__row">
              <dt className="ev-dl__term">{t('warehouse.statuses.DISPATCHED')}</dt>
              <dd className="ev-dl__desc">{formatDateTime(pick.dispatchedAt)}</dd>
            </div>
          )}
          {pick.returnedAt && (
            <div className="ev-dl__row">
              <dt className="ev-dl__term">{t('warehouse.statuses.RETURNED')}</dt>
              <dd className="ev-dl__desc">{formatDateTime(pick.returnedAt)}</dd>
            </div>
          )}
        </dl>

        {canWrite && preparing && (
          <div className="ev-detail__actions">
            {pick.status === 'VERIFIED' && (
              <Button
                size="sm"
                variant="success"
                icon={mdiTruckDelivery}
                disabled={!scheduled}
                onClick={() => setDialog('checkout')}
              >
                {t('warehouse.detail.checkout')}
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={mdiCancel} onClick={() => setDialog('cancel')}>
              {t('warehouse.detail.cancelList')}
            </Button>
          </div>
        )}
        {pick.status === 'VERIFIED' && (
          <div role="alert" className={`alert ${scheduled ? 'alert-success' : 'alert-warning'}`}>
            <span>
              {scheduled ? t('warehouse.detail.readyHint') : t('warehouse.detail.needScheduled')}
            </span>
          </div>
        )}

        <h2 className="ev-section-title">{t('warehouse.detail.lines')}</h2>
        <div className="ev-table-wrap">
          <table className="table">
            <thead className="ev-table__head">
              <tr>
                <th>{t('warehouse.detail.product')}</th>
                <th>{t('warehouse.detail.required')}</th>
                <th>{t('warehouse.detail.picked')}</th>
                <th>{t('warehouse.detail.verified')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pick.lines.map((l) => (
                <tr key={l.productId} className="ev-table__row">
                  <td>
                    {l.productName}
                    {l.unlimited && (
                      <span className="ev-table__hint ev-table__hint--block">
                        {t('warehouse.count.badge')}
                      </span>
                    )}
                    {l.areaPool && (
                      <span className="ev-table__hint ev-table__hint--block">
                        {t('warehouse.detail.areaBadge')}
                      </span>
                    )}
                  </td>
                  <td>{l.areaPool ? `${l.required} m²` : l.required}</td>
                  <td>{l.areaPool ? `${Number(l.picked.toFixed(2))} m²` : l.picked}</td>
                  <td>{l.areaPool ? `${Number(l.verified.toFixed(2))} m²` : l.verified}</td>
                  <td className="ev-progress-cell">
                    <progress
                      className="progress progress-primary"
                      value={l.verified}
                      max={l.required}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CountedLines pick={pick} canWrite={canWrite} onChanged={reload} />
      </PageCard>

      {canWrite && preparing && (
        <PageCard>
          <h2 className="ev-section-title">{t('warehouse.detail.scanTitle')}</h2>
          <div className="join ev-scan__mode">
            {(['PICK', 'VERIFY'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`btn btn-sm join-item ${mode === m ? 'btn-primary' : ''}`.trim()}
                aria-pressed={mode === m}
                onClick={() => {
                  setMode(m);
                  setFeedback(null);
                  input.current?.focus();
                }}
              >
                {t(m === 'PICK' ? 'warehouse.detail.modePick' : 'warehouse.detail.modeVerify')}
              </button>
            ))}
          </div>
          <p className="ev-hint">
            {t(
              mode === 'PICK' ? 'warehouse.detail.scanHintPick' : 'warehouse.detail.scanHintVerify',
            )}
          </p>
          {mode === 'PICK' && (
            <>
              <label className="label ev-toggle-row">
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-sm"
                  checked={extra}
                  onChange={(e) => setExtra(e.target.checked)}
                />
                {t('warehouse.detail.extraToggle')}
              </label>
              <p className="ev-hint">{t('warehouse.detail.extraHint')}</p>
            </>
          )}
          <form className="ev-scan__form" onSubmit={submitScan}>
            <FormField label={t('warehouse.detail.scanLabel')}>
              <input
                ref={input}
                className="input ev-control"
                autoComplete="off"
                autoFocus
                placeholder={t('warehouse.detail.scanPlaceholder')}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </FormField>
            <Button type="submit" variant="primary" icon={mdiBarcodeScan} loading={busy}>
              {t('warehouse.detail.scan')}
            </Button>
          </form>
          {feedback && (
            <div role="alert" className={`alert ${feedback.ok ? 'alert-success' : 'alert-error'}`}>
              <span>{feedback.text}</span>
            </div>
          )}
        </PageCard>
      )}

      {canWrite && awaitingReturn && (
        <PageCard>
          <ReturnPanel pick={pick} onChanged={reload} />
        </PageCard>
      )}

      <PageCard>
        <h2 className="ev-section-title">{t('warehouse.detail.items')}</h2>
        <div className="ev-table-wrap">
          <table className="table">
            <thead className="ev-table__head">
              <tr>
                <th>{t('warehouse.detail.assetCode')}</th>
                <th>{t('common.status')}</th>
                <th>{t('warehouse.detail.assetStatus')}</th>
                <th>{t('warehouse.detail.conditionOut')}</th>
                <th>{t('warehouse.detail.conditionIn')}</th>
                <th>{t('warehouse.detail.times')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pick.items.map((item) => (
                <tr key={item.id} className="ev-table__row">
                  <td>
                    <Link className="ev-link" to={`/assets/${item.assetId}`}>
                      {item.assetCode}
                    </Link>
                    <span className="ev-table__hint ev-table__hint--block">
                      {item.productName}
                      {item.areaM2 !== null && ` · ${item.areaM2} m²`}
                      {item.serial && ` · SN ${item.serial}`}
                      {item.extra && ` · ${t('warehouse.detail.extraBadge')}`}
                    </span>
                  </td>
                  <td>
                    <PickItemStatusBadge status={item.status} />
                  </td>
                  <td>
                    <AssetStatusBadge status={item.assetStatus} />
                  </td>
                  <td>
                    <ConditionBadge condition={item.dispatchCondition ?? item.assetCondition} />
                  </td>
                  <td>
                    {item.returnCondition ? (
                      <ConditionBadge condition={item.returnCondition} />
                    ) : (
                      '-'
                    )}
                    {item.returnNote && (
                      <span className="ev-table__hint ev-table__hint--block">
                        {item.returnNote}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="ev-table__hint ev-table__hint--block">
                      {t('warehouse.detail.pickedAt')}: {formatDateTime(item.pickedAt)}
                    </span>
                    {item.verifiedAt && (
                      <span className="ev-table__hint ev-table__hint--block">
                        {t('warehouse.detail.verifiedAt')}: {formatDateTime(item.verifiedAt)}
                      </span>
                    )}
                    {item.returnedAt && (
                      <span className="ev-table__hint ev-table__hint--block">
                        {t('warehouse.detail.returnedAt')}: {formatDateTime(item.returnedAt)}
                      </span>
                    )}
                  </td>
                  <td className="ev-table__actions">
                    {canWrite && preparing && (
                      <Button size="sm" variant="ghost" onClick={release(item.id)}>
                        {t('warehouse.detail.remove')}
                      </Button>
                    )}
                    {afterDispatch && (item.status === 'RETURNED' || item.status === 'MISSING') && (
                      <ItemPhotos
                        pickListId={pick.id}
                        item={item}
                        canUpload={canWrite}
                        onChanged={reload}
                      />
                    )}
                  </td>
                </tr>
              ))}
              {pick.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="ev-table__empty">
                    {t('common.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PageCard>

      {(pick.documents.length > 0 || afterDispatch) && (
        <PageCard>
          <DocumentsPanel
            documents={pick.documents}
            canSign={canSign}
            canRevise={canWrite}
            onChanged={reload}
          />
        </PageCard>
      )}

      <PageCard>
        <h2 className="ev-section-title">{t('warehouse.detail.scanLog')}</h2>
        <div className="ev-table-wrap">
          <table className="table">
            <thead className="ev-table__head">
              <tr>
                <th>{t('warehouse.detail.time')}</th>
                <th>{t('warehouse.detail.action')}</th>
                <th>{t('warehouse.detail.assetCode')}</th>
                <th>{t('warehouse.detail.result')}</th>
                <th>{t('warehouse.detail.by')}</th>
              </tr>
            </thead>
            <tbody>
              {pick.scans.map((s) => (
                <tr key={s.id} className="ev-table__row" data-rejected={s.result === 'REJECTED'}>
                  <td>{formatDateTime(s.createdAt)}</td>
                  <td>
                    {t(`warehouse.detail.actions.${s.action}`)}
                    <span className="ev-table__hint">
                      {t(`warehouse.detail.methods.${s.method}`)}
                    </span>
                  </td>
                  <td>
                    {s.assetCode ??
                      (s.productName && s.quantity !== null
                        ? `${s.productName} × ${s.quantity}`
                        : '-')}
                  </td>
                  <td>
                    <Badge variant={s.result === 'OK' ? 'success' : 'error'}>
                      {t(`warehouse.detail.results.${s.result}`)}
                    </Badge>
                    {s.reason && (
                      <span className="ev-table__hint">
                        {t(`errors.${s.reason}`, { defaultValue: s.reason })}
                      </span>
                    )}
                  </td>
                  <td>{s.actor ?? '-'}</td>
                </tr>
              ))}
              {pick.scans.length === 0 && (
                <tr>
                  <td colSpan={5} className="ev-table__empty">
                    {t('common.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PageCard>

      {dialog === 'checkout' && (
        <ConfirmModal
          title={t('warehouse.detail.checkout')}
          message={t('warehouse.detail.checkoutConfirm')}
          confirmLabel={t('warehouse.detail.checkout')}
          onConfirm={act(() => checkoutPickList(api, pick.id), 'warehouse.detail.checkedOut')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'cancel' && (
        <ConfirmModal
          title={t('warehouse.detail.cancelList')}
          message={t('warehouse.detail.cancelConfirm')}
          confirmLabel={t('warehouse.detail.cancelList')}
          onConfirm={act(() => cancelPickListById(api, pick.id), 'warehouse.detail.cancelled')}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
