import { useEffect, useState, type FormEvent } from 'react';
import { mdiContentSave } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { createIncident, listReportableOrders } from '@eventra/api-client';
import { INCIDENT_URGENCIES, type IncidentUrgency, type ReportableOrderDto } from '@eventra/shared';
import { api } from '@/api';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { SearchSelect } from '@/components/ui/SearchSelect';

interface ReportModalProps {
  onClose: () => void;
  onCreated: (id: string) => void;
}

/** Langkah 1 laporan: scan QR aset rusak (atau kode aset), urgensi, dan deskripsi. Foto di langkah berikutnya. */
export function ReportModal({ onClose, onCreated }: ReportModalProps) {
  const { t } = useTranslation();
  const [orderNumber, setOrderNumber] = useState('');
  const [code, setCode] = useState('');
  const [urgency, setUrgency] = useState<IncidentUrgency>('MEDIUM');
  const [description, setDescription] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [orders, setOrders] = useState<ReportableOrderDto[]>([]);

  useEffect(() => {
    listReportableOrders(api)
      .then(setOrders)
      .catch(() => undefined /* error sudah tampil sebagai notifikasi */);
  }, []);

  const orderOptions = orders.map((o) => ({
    value: o.number,
    label: `${o.number} · ${o.customerName} · ${o.eventLocation}`,
  }));
  const assetOptions = (orders.find((o) => o.number === orderNumber)?.assets ?? []).map((a) => ({
    value: a.code,
    label: `${a.code} · ${a.productName}`,
  }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!orderNumber || !code) return;
    setSaving(true);
    try {
      const incident = await createIncident(api, {
        orderNumber,
        assetCode: code,
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
        <FormField label={t('incidents.orderNumber')}>
          <SearchSelect
            options={orderOptions}
            value={orderNumber}
            onChange={(value) => {
              setOrderNumber(value);
              setCode('');
            }}
            ariaLabel={t('incidents.orderNumber')}
          />
        </FormField>
        <FormField label={t('incidents.scanLabel')}>
          <SearchSelect
            options={assetOptions}
            value={code}
            onChange={setCode}
            disabled={!orderNumber}
            ariaLabel={t('incidents.scanLabel')}
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
