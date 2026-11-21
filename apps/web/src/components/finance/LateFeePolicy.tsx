import { useState, type FormEvent } from 'react';
import { mdiCog, mdiContentSave } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { getLateFeePolicy, updateLateFeePolicy } from '@eventra/api-client';
import type { LateFeePolicyDto } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { useResource } from '@/hooks/useResource';
import { notify } from '@/lib/notifications';

function LateFeePolicyModal({
  current,
  onClose,
  onSaved,
}: {
  current: LateFeePolicyDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(current.enabled);
  const [percent, setPercent] = useState(String(current.percentPerDay));
  const [grace, setGrace] = useState(String(current.graceDays));
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await updateLateFeePolicy(api, {
        enabled,
        percentPerDay: Number(percent),
        graceDays: Number(grace),
      });
      notify('success', t('finance.lateFee.policySaved'));
      onSaved();
      onClose();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={t('finance.lateFee.policyTitle')} onClose={onClose}>
      <form className="ev-form" onSubmit={submit}>
        <p className="ev-hint">{t('finance.lateFee.policyHint')}</p>
        <label className="ev-toggle-row">
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>{t('finance.lateFee.enabledLabel')}</span>
        </label>
        <FormField label={t('finance.lateFee.percentLabel')}>
          <input
            type="number"
            className="input ev-control"
            min={0}
            max={100}
            step="0.01"
            required
            disabled={!enabled}
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
          />
        </FormField>
        <FormField label={t('finance.lateFee.graceLabel')}>
          <input
            type="number"
            className="input ev-control"
            min={0}
            max={30}
            step={1}
            required
            disabled={!enabled}
            value={grace}
            onChange={(e) => setGrace(e.target.value)}
          />
        </FormField>
        <div className="modal-action">
          <Button type="submit" variant="primary" icon={mdiContentSave} loading={saving}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Status denda keterlambatan; Owner dapat mengaktifkan/menonaktifkan dan mengatur tarifnya. */
export function LateFeePolicy() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const policy = useResource(() => getLateFeePolicy(api), 'late-fee-policy');
  if (!policy.data) return null;

  return (
    <>
      <Badge variant={policy.data.enabled ? 'warning' : 'neutral'}>
        {policy.data.enabled
          ? t('finance.lateFee.badgeOn', { percent: policy.data.percentPerDay })
          : t('finance.lateFee.badgeOff')}
      </Badge>
      {can('finance.policy') && (
        <Button size="sm" variant="ghost" icon={mdiCog} onClick={() => setEditing(true)}>
          {t('finance.lateFee.policy')}
        </Button>
      )}
      {editing && (
        <LateFeePolicyModal
          current={policy.data}
          onClose={() => setEditing(false)}
          onSaved={policy.reload}
        />
      )}
    </>
  );
}
