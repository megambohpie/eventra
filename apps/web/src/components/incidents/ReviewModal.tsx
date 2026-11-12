import { useState, type FormEvent } from 'react';
import { mdiCheck } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { reviewIncident } from '@eventra/api-client';
import { INCIDENT_DECISIONS, type IncidentDecision } from '@eventra/shared';
import { api } from '@/api';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { notify } from '@/lib/notifications';

interface ReviewModalProps {
  incidentId: string;
  onClose: () => void;
  onChanged: () => void;
}

/** Keputusan admin: panduan perbaikan, kunjungan teknisi, tolak (alasan wajib), atau penggantian. */
export function ReviewModal({ incidentId, onClose, onChanged }: ReviewModalProps) {
  const { t } = useTranslation();
  const [decision, setDecision] = useState<IncidentDecision>('GUIDANCE');
  const [note, setNote] = useState('');
  const [technicianName, setTechnicianName] = useState('');
  const [saving, setSaving] = useState(false);
  const noteRequired = decision === 'GUIDANCE' || decision === 'REJECT';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await reviewIncident(api, incidentId, {
        decision,
        note,
        ...(decision === 'TECHNICIAN' ? { technicianName } : {}),
      });
      notify('success', t('incidents.reviewed'));
      onChanged();
      onClose();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={t('incidents.reviewTitle')} onClose={onClose}>
      <form className="ev-form" onSubmit={submit}>
        <FormField label={t('incidents.decision')}>
          <select
            className="select ev-control"
            value={decision}
            onChange={(e) => setDecision(e.target.value as IncidentDecision)}
          >
            {INCIDENT_DECISIONS.map((d) => (
              <option key={d} value={d}>
                {t(`incidents.decisions.${d}`)}
              </option>
            ))}
          </select>
        </FormField>
        <p className="ev-hint">{t(`incidents.decisionHints.${decision}`)}</p>
        {decision === 'TECHNICIAN' && (
          <FormField label={t('incidents.technician')}>
            <input
              className="input ev-control"
              required
              maxLength={120}
              value={technicianName}
              onChange={(e) => setTechnicianName(e.target.value)}
            />
          </FormField>
        )}
        <FormField label={t(noteRequired ? 'incidents.decisionNote' : 'common.note')}>
          <textarea
            className="textarea ev-control"
            required={noteRequired}
            minLength={noteRequired ? 3 : undefined}
            maxLength={1000}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>
        <div className="modal-action">
          <Button type="submit" variant="primary" icon={mdiCheck} loading={saving}>
            {t('incidents.saveDecision')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
