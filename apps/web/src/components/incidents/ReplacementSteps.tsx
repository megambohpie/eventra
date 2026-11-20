import { useRef, useState, type FormEvent } from 'react';
import {
  mdiBarcodeScan,
  mdiCheck,
  mdiClockOutline,
  mdiLock,
  mdiTruckDelivery,
  mdiUndo,
} from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  ApiRequestError,
  dispatchReplacement,
  releaseReplacementAsset,
  scanReplacement,
} from '@eventra/api-client';
import type { ReplacementStatus, ReplacementTaskDto } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { ConditionBadge } from '@/components/assets/badges';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import { formatDateTime } from '@/lib/format';
import { notify } from '@/lib/notifications';

const ASSET_CODE = /^AST-[A-Z0-9-]+$/i;

export const REPLACEMENT_STEPS = ['PICK', 'VERIFY', 'DISPATCH', 'RECEIVE'] as const;
export type ReplacementStep = (typeof REPLACEMENT_STEPS)[number];

/** Langkah yang sedang menunggu untuk status tugas (4 = semua selesai, -1 = dibatalkan). */
export function currentStepIndex(status: ReplacementStatus): number {
  switch (status) {
    case 'PENDING_PICK':
      return 0;
    case 'PICKED':
      return 1;
    case 'VERIFIED':
      return 2;
    case 'DISPATCHED':
      return 3;
    case 'RECEIVED':
      return REPLACEMENT_STEPS.length;
    default:
      return -1;
  }
}

type StepState = 'done' | 'current' | 'todo';

interface ReplacementStepsProps {
  task: ReplacementTaskDto;
  onChanged: () => void;
}

/**
 * Proses penggantian per langkah (tab): Pilih aset → Verifikasi → Kirim → Terima. Tiap tab hanya
 * memuat isi langkahnya dan menandai selesai/saat ini/belum; tab otomatis pindah ke langkah
 * berikutnya setelah satu langkah selesai, dan langkah lain tetap dapat dibuka untuk dilihat.
 */
export function ReplacementSteps({ task, onChanged }: ReplacementStepsProps) {
  const { t } = useTranslation();
  const current = currentStepIndex(task.status);
  const cancelled = current < 0;
  // Pilihan manual hanya berlaku untuk status yang sama; saat status maju, tab ikut langkah baru.
  const [chosen, setChosen] = useState<{ status: ReplacementStatus; index: number } | null>(null);
  const shown =
    chosen && chosen.status === task.status
      ? chosen.index
      : Math.min(Math.max(current, 0), REPLACEMENT_STEPS.length - 1);

  const stateOf = (index: number): StepState =>
    cancelled ? 'todo' : index < current ? 'done' : index === current ? 'current' : 'todo';

  return (
    <>
      <p className="ev-hint">
        {cancelled
          ? t('replacements.cancelledHint')
          : current >= REPLACEMENT_STEPS.length
            ? t('replacements.allDone')
            : t('replacements.stepProgress', {
                current: current + 1,
                total: REPLACEMENT_STEPS.length,
                name: t(`replacements.steps.${REPLACEMENT_STEPS[current]}`),
              })}
      </p>
      <div role="tablist" className="tabs tabs-border ev-tabs">
        {REPLACEMENT_STEPS.map((step, index) => {
          const state = stateOf(index);
          return (
            <button
              key={step}
              type="button"
              role="tab"
              className={`tab ${shown === index ? 'tab-active' : ''}`.trim()}
              aria-selected={shown === index}
              onClick={() => setChosen({ status: task.status, index })}
            >
              {index + 1}. {t(`replacements.steps.${step}`)}
              <span className="ev-tabs__count" data-state={state}>
                <Icon
                  path={
                    state === 'done' ? mdiCheck : state === 'current' ? mdiClockOutline : mdiLock
                  }
                  title={t(`replacements.stepState.${state}`)}
                />
              </span>
            </button>
          );
        })}
      </div>
      <div className="ev-steps__panel">
        <StepPanel
          step={REPLACEMENT_STEPS[shown] ?? 'PICK'}
          state={stateOf(shown)}
          task={task}
          onChanged={onChanged}
        />
      </div>
    </>
  );
}

function StepPanel({
  step,
  state,
  task,
  onChanged,
}: {
  step: ReplacementStep;
  state: StepState;
  task: ReplacementTaskDto;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canWrite = can('warehouse.write');
  const cancelled = task.status === 'CANCELLED';

  if (cancelled) return <p className="ev-hint">{t('replacements.cancelledHint')}</p>;
  if (state === 'todo') {
    return (
      <div role="alert" className="alert alert-info">
        <span>{t('replacements.locked')}</span>
      </div>
    );
  }

  const release = async () => {
    try {
      await releaseReplacementAsset(api, task.id);
      notify('success', t('replacements.released'));
      onChanged();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };
  const chosenAsset = task.replacementAsset && (
    <p>
      {t('replacements.chosenAsset')}:{' '}
      <Link className="ev-link" to={`/assets/${task.replacementAsset.id}`}>
        <strong>{task.replacementAsset.code}</strong>
      </Link>
    </p>
  );
  const undo = canWrite && (task.status === 'PICKED' || task.status === 'VERIFIED') && (
    <Button size="sm" variant="ghost" icon={mdiUndo} onClick={release}>
      {t('replacements.release')}
    </Button>
  );

  if (step === 'PICK') {
    if (task.status === 'PENDING_PICK') {
      return canWrite ? (
        <ScanStep task={task} action="PICK" onChanged={onChanged} />
      ) : (
        <p className="ev-hint">{t('replacements.waitingWarehouse')}</p>
      );
    }
    return (
      <div className="ev-steps__done">
        {chosenAsset}
        {task.pickedAt && (
          <p className="ev-hint">
            {t('replacements.pickedAt')}: {formatDateTime(task.pickedAt)}
          </p>
        )}
        {undo}
      </div>
    );
  }

  if (step === 'VERIFY') {
    if (task.status === 'PICKED') {
      return canWrite ? (
        <>
          {chosenAsset}
          <ScanStep task={task} action="VERIFY" onChanged={onChanged} />
          {undo}
        </>
      ) : (
        <p className="ev-hint">{t('replacements.waitingWarehouse')}</p>
      );
    }
    return (
      <div className="ev-steps__done">
        <p>{t('replacements.verifiedDone')}</p>
        {task.verifiedAt && (
          <p className="ev-hint">
            {t('replacements.verifiedAt')}: {formatDateTime(task.verifiedAt)}
          </p>
        )}
      </div>
    );
  }

  if (step === 'DISPATCH') {
    if (task.status === 'VERIFIED') {
      return (
        <div className="ev-steps__done">
          <h2 className="ev-section-title">{t('replacements.dispatchTitle')}</h2>
          {chosenAsset}
          <p className="ev-hint">{t('replacements.dispatchHint')}</p>
          {canWrite ? (
            <div className="ev-actions">
              <Button
                variant="success"
                icon={mdiTruckDelivery}
                onClick={async () => {
                  try {
                    await dispatchReplacement(api, task.id);
                    notify('success', t('replacements.dispatchedOk'));
                    onChanged();
                  } catch {
                    /* error sudah tampil sebagai notifikasi */
                  }
                }}
              >
                {t('replacements.dispatch')}
              </Button>
              {undo}
            </div>
          ) : (
            <p className="ev-hint">{t('replacements.waitingWarehouse')}</p>
          )}
        </div>
      );
    }
    return (
      <div className="ev-steps__done">
        <p>{t('replacements.dispatchedOk')}</p>
        {task.dispatchedAt && (
          <p className="ev-hint">
            {t('replacements.dispatchedAt')}: {formatDateTime(task.dispatchedAt)}
          </p>
        )}
      </div>
    );
  }

  // RECEIVE
  if (task.status === 'DISPATCHED') {
    return (
      <div role="alert" className="alert alert-info">
        <span>{t('replacements.receiveMobileOnly')}</span>
      </div>
    );
  }
  return (
    <div className="ev-steps__done">
      <p>{t('replacements.receivedSummary')}</p>
      {task.receivedAt && (
        <p className="ev-hint">
          {t('replacements.receivedAt')}: {formatDateTime(task.receivedAt)}
          {task.receivedBy && ` · ${task.receivedBy}`}{' '}
          {task.receiveCondition && <ConditionBadge condition={task.receiveCondition} />}
        </p>
      )}
      {task.receiveNote && <p className="ev-hint">{task.receiveNote}</p>}
    </div>
  );
}

/** Form scan/ketik aset untuk langkah Pilih atau Verifikasi. */
function ScanStep({
  task,
  action,
  onChanged,
}: {
  task: ReplacementTaskDto;
  action: 'PICK' | 'VERIFY';
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const raw = value.trim();
    if (!raw) return;
    const manual = ASSET_CODE.test(raw) && (action === 'PICK' || can('scan.manual'));
    setBusy(true);
    try {
      const out = await scanReplacement(api, task.id, {
        action,
        ...(manual ? { assetCode: raw.toUpperCase() } : { qrToken: raw }),
      });
      setFeedback({
        ok: true,
        text: t(action === 'PICK' ? 'replacements.pickedOk' : 'replacements.verifiedOk', {
          code: out.replacementAsset?.code ?? '',
        }),
      });
      setValue('');
      onChanged();
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

  return (
    <>
      <h2 className="ev-section-title">
        {t(action === 'PICK' ? 'replacements.pickTitle' : 'replacements.verifyTitle')}
      </h2>
      <p className="ev-hint">
        {t(action === 'PICK' ? 'replacements.pickHint' : 'replacements.verifyHint')}
      </p>
      <form className="ev-scan__form" onSubmit={submit}>
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
    </>
  );
}
