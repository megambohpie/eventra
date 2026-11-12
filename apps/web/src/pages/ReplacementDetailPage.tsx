import { useRef, useState, type FormEvent } from 'react';
import { mdiBarcodeScan, mdiTruckDelivery, mdiUndo } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import {
  ApiRequestError,
  dispatchReplacement,
  getReplacement,
  releaseReplacementAsset,
  scanReplacement,
} from '@eventra/api-client';
import type { ReplacementTaskDto } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { ReceiveForm, ReplacementInfo } from '@/components/incidents/ReplacementInfo';
import { UrgencyBadge } from '@/components/incidents/badges';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { useResource } from '@/hooks/useResource';
import { notify } from '@/lib/notifications';

const ASSET_CODE = /^AST-[A-Z0-9-]+$/i;

export function ReplacementDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { data: task, loading, reload } = useResource(() => getReplacement(api, id), id);

  if (loading && !task) return <Loading />;
  if (!task) {
    return (
      <PageCard>
        <p>{t('common.empty')}</p>
        <Link className="btn btn-ghost btn-sm" to="/replacements">
          {t('common.back')}
        </Link>
      </PageCard>
    );
  }
  return <Detail task={task} reload={reload} />;
}

function Detail({ task, reload }: { task: ReplacementTaskDto; reload: () => void }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const canWrite = can('warehouse.write');
  const mode = task.status === 'PENDING_PICK' ? 'PICK' : task.status === 'PICKED' ? 'VERIFY' : null;

  const submitScan = async (event: FormEvent) => {
    event.preventDefault();
    const raw = value.trim();
    if (!raw || !mode) return;
    const manual = mode === 'PICK' && ASSET_CODE.test(raw);
    setBusy(true);
    try {
      const out = await scanReplacement(api, task.id, {
        action: mode,
        ...(manual ? { assetCode: raw.toUpperCase() } : { qrToken: raw }),
      });
      setFeedback({
        ok: true,
        text: t(mode === 'PICK' ? 'replacements.pickedOk' : 'replacements.verifiedOk', {
          code: out.replacementAsset?.code ?? '',
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

  const act = (action: () => Promise<unknown>, doneKey: string) => async () => {
    try {
      await action();
      notify('success', t(doneKey));
      setFeedback(null);
      reload();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  return (
    <>
      <PageCard>
        <PageHeader title={task.number} subtitle={`${task.incidentNumber} · ${task.productName}`}>
          <Link className="btn btn-ghost btn-sm" to="/replacements">
            {t('common.back')}
          </Link>
          {can('incident.read') && (
            <Link className="btn btn-ghost btn-sm" to={`/incidents/${task.incidentId}`}>
              {t('replacements.openIncident')}
            </Link>
          )}
          {canWrite && task.status === 'VERIFIED' && (
            <Button
              size="sm"
              variant="success"
              icon={mdiTruckDelivery}
              onClick={act(() => dispatchReplacement(api, task.id), 'replacements.dispatchedOk')}
            >
              {t('replacements.dispatch')}
            </Button>
          )}
          {canWrite && (task.status === 'PICKED' || task.status === 'VERIFIED') && (
            <Button
              size="sm"
              variant="ghost"
              icon={mdiUndo}
              onClick={act(() => releaseReplacementAsset(api, task.id), 'replacements.released')}
            >
              {t('replacements.release')}
            </Button>
          )}
        </PageHeader>
        <div className="ev-detail__badges">
          <UrgencyBadge urgency={task.urgency} />
        </div>
        <dl className="ev-dl">
          <div className="ev-dl__row">
            <dt className="ev-dl__term">{t('incidents.order')}</dt>
            <dd className="ev-dl__desc">
              {task.orderNumber} · {task.eventLocation}
            </dd>
          </div>
        </dl>
        <ReplacementInfo task={task} />
        {task.status === 'CANCELLED' && (
          <div role="alert" className="alert alert-warning">
            <span>{t('replacements.cancelledHint')}</span>
          </div>
        )}
      </PageCard>

      {canWrite && mode && (
        <PageCard>
          <h2 className="ev-section-title">
            {t(mode === 'PICK' ? 'replacements.pickTitle' : 'replacements.verifyTitle')}
          </h2>
          <p className="ev-hint">
            {t(mode === 'PICK' ? 'replacements.pickHint' : 'replacements.verifyHint')}
          </p>
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

      {task.status === 'DISPATCHED' && can('replacement.receive') && (
        <PageCard>
          <h2 className="ev-section-title">{t('replacements.receiveTitle')}</h2>
          <ReceiveForm task={task} onChanged={reload} />
        </PageCard>
      )}
    </>
  );
}
