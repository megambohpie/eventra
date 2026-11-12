import { useState, type FormEvent } from 'react';
import { mdiPackageVariantClosedCheck } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ApiRequestError, receiveReplacement } from '@eventra/api-client';
import { ASSET_CONDITIONS, type AssetCondition, type ReplacementTaskDto } from '@eventra/shared';
import { api } from '@/api';
import { ConditionBadge } from '@/components/assets/badges';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { formatDateTime } from '@/lib/format';
import { notify } from '@/lib/notifications';
import { ReplacementStatusBadge } from './badges';

/** Ringkasan tugas penggantian: aset lama ↔ aset pengganti, tertaut ke insiden yang sama. */
export function ReplacementInfo({ task }: { task: ReplacementTaskDto }) {
  const { t } = useTranslation();
  return (
    <dl className="ev-dl">
      <div className="ev-dl__row">
        <dt className="ev-dl__term">{t('replacements.number')}</dt>
        <dd className="ev-dl__desc">
          {task.number} <ReplacementStatusBadge status={task.status} />
        </dd>
      </div>
      <div className="ev-dl__row">
        <dt className="ev-dl__term">{t('replacements.oldAsset')}</dt>
        <dd className="ev-dl__desc">
          <Link className="ev-link" to={`/assets/${task.oldAsset.id}`}>
            {task.oldAsset.code}
          </Link>
        </dd>
      </div>
      <div className="ev-dl__row">
        <dt className="ev-dl__term">{t('replacements.newAsset')}</dt>
        <dd className="ev-dl__desc">
          {task.replacementAsset ? (
            <Link className="ev-link" to={`/assets/${task.replacementAsset.id}`}>
              {task.replacementAsset.code}
            </Link>
          ) : (
            '-'
          )}
        </dd>
      </div>
      {task.dispatchedAt && (
        <div className="ev-dl__row">
          <dt className="ev-dl__term">{t('replacements.dispatchedAt')}</dt>
          <dd className="ev-dl__desc">{formatDateTime(task.dispatchedAt)}</dd>
        </div>
      )}
      {task.receivedAt && (
        <div className="ev-dl__row">
          <dt className="ev-dl__term">{t('replacements.receivedAt')}</dt>
          <dd className="ev-dl__desc">
            {formatDateTime(task.receivedAt)}
            {task.receivedBy && ` · ${task.receivedBy}`}{' '}
            {task.receiveCondition && <ConditionBadge condition={task.receiveCondition} />}
          </dd>
        </div>
      )}
    </dl>
  );
}

interface ReceiveFormProps {
  task: ReplacementTaskDto;
  onChanged: () => void;
}

/** PIC lapangan memindai QR aset pengganti saat diterima (aset harus sama dengan yang dikirim gudang). */
export function ReceiveForm({ task, onChanged }: ReceiveFormProps) {
  const { t } = useTranslation();
  const [qrToken, setQrToken] = useState('');
  const [condition, setCondition] = useState<AssetCondition>('GOOD');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await receiveReplacement(api, task.id, { qrToken: qrToken.trim(), condition, note });
      notify('success', t('replacements.receivedOk'));
      onChanged();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setFeedback(t(`errors.${error.code}`, { defaultValue: error.message }));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="ev-form" onSubmit={submit}>
      <p className="ev-hint">{t('replacements.receiveHint')}</p>
      <FormField label={t('replacements.scanReceive')}>
        <input
          className="input ev-control"
          autoComplete="off"
          required
          placeholder={t('replacements.scanPlaceholder')}
          value={qrToken}
          onChange={(e) => setQrToken(e.target.value)}
        />
      </FormField>
      <FormField label={t('assets.condition')}>
        <select
          className="select ev-control"
          value={condition}
          onChange={(e) => setCondition(e.target.value as AssetCondition)}
        >
          {ASSET_CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {t(`assets.conditions.${c}`)}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label={t('common.note')}>
        <input
          className="input ev-control"
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </FormField>
      {feedback && (
        <div role="alert" className="alert alert-error">
          <span>{feedback}</span>
        </div>
      )}
      <Button type="submit" variant="success" icon={mdiPackageVariantClosedCheck} loading={saving}>
        {t('replacements.confirmReceive')}
      </Button>
    </form>
  );
}
