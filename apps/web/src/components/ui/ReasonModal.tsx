import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { FormField } from './FormField';
import { Modal } from './Modal';

interface ReasonModalProps {
  title: string;
  label: string;
  confirmLabel: string;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}

/** Dialog satu alasan teks wajib (mis. membatalkan tiket/tugas); tombol konfirmasi menampilkan loading. */
export function ReasonModal({ title, label, confirmLabel, onConfirm, onClose }: ReasonModalProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={title} onClose={onClose}>
      <form className="ev-form" onSubmit={submit}>
        <FormField label={label}>
          <textarea
            className="textarea ev-control"
            required
            minLength={3}
            maxLength={500}
            rows={3}
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
        <div className="modal-action">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
