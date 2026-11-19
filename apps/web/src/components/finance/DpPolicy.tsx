import { useState, type FormEvent } from 'react';
import { mdiCog, mdiContentSave } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { getPaymentPolicy, updatePaymentPolicy } from '@eventra/api-client';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { useResource } from '@/hooks/useResource';
import { notify } from '@/lib/notifications';

function DpPolicyModal({
  current,
  onClose,
  onSaved,
}: {
  current: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [percent, setPercent] = useState(String(current));
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await updatePaymentPolicy(api, { dpMinPercent: Number(percent) });
      notify('success', t('finance.dp.policySaved'));
      onSaved();
      onClose();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={t('finance.dp.policyTitle')} onClose={onClose}>
      <form className="ev-form" onSubmit={submit}>
        <p className="ev-hint">{t('finance.dp.policyHint')}</p>
        <FormField label={t('finance.dp.percentLabel')}>
          <input
            type="number"
            className="input ev-control"
            min={0}
            max={100}
            step={1}
            required
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
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

/** DP minimum yang berlaku; Owner dapat mengubahnya. */
export function DpPolicy() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const policy = useResource(() => getPaymentPolicy(api), 'payment-policy');
  if (!policy.data) return null;

  return (
    <>
      <Badge variant="info">{t('finance.dp.badge', { percent: policy.data.dpMinPercent })}</Badge>
      {can('finance.policy') && (
        <Button size="sm" variant="ghost" icon={mdiCog} onClick={() => setEditing(true)}>
          {t('finance.dp.policy')}
        </Button>
      )}
      {editing && (
        <DpPolicyModal
          current={policy.data.dpMinPercent}
          onClose={() => setEditing(false)}
          onSaved={policy.reload}
        />
      )}
    </>
  );
}
