import { useState, type FormEvent } from 'react';
import { mdiContentSave } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { createIncident } from '@eventra/api-client';
import { INCIDENT_URGENCIES, type IncidentUrgency } from '@eventra/shared';
import { api } from '@/api';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';

const ASSET_CODE = /^AST-[A-Z0-9-]+$/i;

interface ReportModalProps {
  onClose: () => void;
  onCreated: (id: string) => void;
}

/** Langkah 1 laporan: scan QR aset rusak (atau kode aset), urgensi, dan deskripsi. Foto di langkah berikutnya. */
export function ReportModal({ onClose, onCreated }: ReportModalProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [urgency, setUrgency] = useState<IncidentUrgency>('MEDIUM');
  const [description, setDescription] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const raw = code.trim();
    setSaving(true);
    try {
      const incident = await createIncident(api, {
        ...(ASSET_CODE.test(raw) ? { assetCode: raw.toUpperCase() } : { qrToken: raw }),
        urgency,
        description,
        locationNote,
      });
      onCreated(incident.id);
    } catch {
      /* error sudah tampil sebagai notifikasi */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={t('incidents.reportTitle')} onClose={onClose}>
      <form className="ev-form" onSubmit={submit}>
        <p className="ev-hint">{t('incidents.reportHint')}</p>
        <FormField label={t('incidents.scanLabel')}>
          <input
            className="input ev-control"
            autoComplete="off"
            autoFocus
            required
            placeholder={t('incidents.scanPlaceholder')}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </FormField>
        <FormField label={t('incidents.urgency')}>
          <select
            className="select ev-control"
            value={urgency}
            onChange={(e) => setUrgency(e.target.value as IncidentUrgency)}
          >
            {INCIDENT_URGENCIES.map((u) => (
              <option key={u} value={u}>
                {t(`incidents.urgencies.${u}`)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={t('incidents.description')}>
          <textarea
            className="textarea ev-control"
            required
            minLength={5}
            maxLength={2000}
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
        <FormField label={t('incidents.locationNote')}>
          <input
            className="input ev-control"
            maxLength={300}
            value={locationNote}
            onChange={(e) => setLocationNote(e.target.value)}
          />
        </FormField>
        <div className="modal-action">
          <Button type="submit" variant="primary" icon={mdiContentSave} loading={saving}>
            {t('incidents.continue')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
