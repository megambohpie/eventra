import { useState, type FormEvent } from 'react';
import { mdiCheck } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { closeIncident } from '@eventra/api-client';
import { ASSET_CONDITIONS, type AssetCondition } from '@eventra/shared';
import { api } from '@/api';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { notify } from '@/lib/notifications';

interface CloseModalProps {
  incidentId: string;
  onClose: () => void;
  onChanged: () => void;
}

/** Tutup insiden yang tuntas di lokasi: kondisi aset setelah ditangani (tidak boleh rusak). */
export function CloseModal({ incidentId, onClose, onChanged }: CloseModalProps) {
  const { t } = useTranslation();
  const [condition, setCondition] = useState<AssetCondition>('GOOD');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await closeIncident(api, incidentId, { condition, note });
      notify('success', t('incidents.closed'));
      onChanged();
      onClose();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={t('incidents.closeTitle')} onClose={onClose}>
      <form className="ev-form" onSubmit={submit}>
        <p className="ev-hint">{t('incidents.closeHint')}</p>
        <FormField label={t('incidents.conditionAfter')}>
          <select
            className="select ev-control"
            value={condition}
            onChange={(e) => setCondition(e.target.value as AssetCondition)}
          >
            {ASSET_CONDITIONS.filter((c) => c !== 'DAMAGED').map((c) => (
              <option key={c} value={c}>
                {t(`assets.conditions.${c}`)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={t('common.note')}>
          <textarea
            className="textarea ev-control"
            required
            minLength={3}
            maxLength={1000}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>
        <div className="modal-action">
          <Button type="submit" variant="primary" icon={mdiCheck} loading={saving}>
            {t('incidents.closeAction')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
