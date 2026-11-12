import { useState, type FormEvent } from 'react';
import { mdiCheck, mdiContentSave } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { completeServiceTicket, createServiceTicket, listAssets } from '@eventra/api-client';
import {
  ASSET_CONDITIONS,
  INSPECTION_RESULTS,
  type AssetCondition,
  type InspectionResult,
  type ServiceTicketDto,
} from '@eventra/shared';
import { api } from '@/api';
import { Button } from '@/components/ui/Button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { notify, notifyError } from '@/lib/notifications';

interface CreateProps {
  onClose: () => void;
  onChanged: () => void;
}

/** Buka tiket servis: aset dicari lewat kode aset (AST-…). Aset di gudang otomatis berstatus Dalam servis. */
export function TicketCreateModal({ onClose, onChanged }: CreateProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [complaint, setComplaint] = useState('');
  const [vendor, setVendor] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const wanted = code.trim().toUpperCase();
      const found = await listAssets(api, { q: wanted, pageSize: 20 });
      const asset = found.items.find((a) => a.code.toUpperCase() === wanted);
      if (!asset) {
        notifyError(t('service.assetNotFound'));
        return;
      }
      await createServiceTicket(api, { assetId: asset.id, complaint, vendor });
      notify('success', t('common.saved'));
      onChanged();
      onClose();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={t('service.newTitle')} onClose={onClose}>
      <form className="ev-form" onSubmit={submit}>
        <p className="ev-hint">{t('service.newHint')}</p>
        <FormField label={t('service.assetCode')}>
          <input
            className="input ev-control"
            autoComplete="off"
            autoFocus
            required
            placeholder="AST-000001"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </FormField>
        <FormField label={t('service.complaint')}>
          <textarea
            className="textarea ev-control"
            required
            minLength={3}
            maxLength={1000}
            rows={3}
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
          />
        </FormField>
        <FormField label={t('service.vendor')}>
          <input
            className="input ev-control"
            maxLength={160}
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
          />
        </FormField>
        <div className="modal-action">
          <Button type="submit" variant="primary" icon={mdiContentSave} loading={saving}>
            {t('service.create')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

interface CompleteProps extends CreateProps {
  ticket: ServiceTicketDto;
  /** Biaya hanya dapat diisi pengguna yang berhak melihat biaya aset. */
  canCost: boolean;
}

/** Selesaikan servis dengan hasil pemeriksaan; hanya yang lolos yang membuat aset tersedia kembali. */
export function TicketCompleteModal({ ticket, canCost, onClose, onChanged }: CompleteProps) {
  const { t } = useTranslation();
  const [actionTaken, setActionTaken] = useState('');
  const [cost, setCost] = useState('');
  const [inspection, setInspection] = useState<InspectionResult>('PASSED');
  const [inspectionNote, setInspectionNote] = useState('');
  const [conditionAfter, setConditionAfter] = useState<AssetCondition>('GOOD');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await completeServiceTicket(api, ticket.id, {
        actionTaken,
        inspection,
        inspectionNote,
        conditionAfter,
        ...(canCost && cost ? { cost: Number(cost) } : {}),
      });
      notify('success', t('service.completed'));
      onChanged();
      onClose();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={t('service.completeTitle', { number: ticket.number })} onClose={onClose}>
      <form className="ev-form" onSubmit={submit}>
        <FormField label={t('service.actionTaken')}>
          <textarea
            className="textarea ev-control"
            required
            minLength={3}
            maxLength={1000}
            rows={3}
            value={actionTaken}
            onChange={(e) => setActionTaken(e.target.value)}
          />
        </FormField>
        {canCost && (
          <FormField label={t('service.cost')}>
            <CurrencyInput value={cost} onChange={setCost} />
          </FormField>
        )}
        <FormField label={t('service.inspection')}>
          <select
            className="select ev-control"
            value={inspection}
            onChange={(e) => setInspection(e.target.value as InspectionResult)}
          >
            {INSPECTION_RESULTS.map((r) => (
              <option key={r} value={r}>
                {t(`service.inspections.${r}`)}
              </option>
            ))}
          </select>
        </FormField>
        <p className="ev-hint">{t(`service.inspectionHints.${inspection}`)}</p>
        <FormField label={t('service.conditionAfter')}>
          <select
            className="select ev-control"
            value={conditionAfter}
            onChange={(e) => setConditionAfter(e.target.value as AssetCondition)}
          >
            {ASSET_CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {t(`assets.conditions.${c}`)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={t('service.inspectionNote')}>
          <input
            className="input ev-control"
            maxLength={500}
            value={inspectionNote}
            onChange={(e) => setInspectionNote(e.target.value)}
          />
        </FormField>
        <div className="modal-action">
          <Button type="submit" variant="primary" icon={mdiCheck} loading={saving}>
            {t('service.complete')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
