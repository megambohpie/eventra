import { useRef, useState, type FormEvent } from 'react';
import { mdiCheckAll, mdiKeyboardReturn } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { ApiRequestError, completeReturn, listLocations, scanReturn } from '@eventra/api-client';
import { ASSET_CONDITIONS, type AssetCondition, type PickListDto } from '@eventra/shared';
import { api } from '@/api';
import { Button } from '@/components/ui/Button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { FormField } from '@/components/ui/FormField';
import { useResource } from '@/hooks/useResource';
import { notify } from '@/lib/notifications';

interface ReturnPanelProps {
  pick: PickListDto;
  onChanged: () => void;
}

/** Scan pengembalian (kondisi + catatan) dan penyelesaian pengembalian dengan konfirmasi selisih. */
export function ReturnPanel({ pick, onChanged }: ReturnPanelProps) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState('');
  const [condition, setCondition] = useState<AssetCondition>('GOOD');
  const [note, setNote] = useState('');
  const [locationId, setLocationId] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const locations = useResource(() => listLocations(api), 'locations');

  const unresolved = pick.items.filter((i) => i.status === 'DISPATCHED');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = token.trim();
    if (!value) return;
    setBusy(true);
    try {
      const out = await scanReturn(api, pick.id, {
        qrToken: value,
        condition,
        note,
        locationId: locationId || undefined,
      });
      setFeedback({
        ok: true,
        text: t('warehouse.detail.returnedOk', { code: out.item.assetCode }),
      });
      setToken('');
      setNote('');
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

  const finish = async (acceptMissing: boolean) => {
    try {
      await completeReturn(api, pick.id, { acceptMissing });
      notify('success', t('warehouse.detail.finishOk'));
      setConfirmFinish(false);
      onChanged();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  return (
    <>
      <h2 className="ev-section-title">{t('warehouse.detail.returnTitle')}</h2>
      <p className="ev-hint">{t('warehouse.detail.returnHint')}</p>
      <form className="ev-form-grid" onSubmit={submit}>
        <div className="ev-form-grid__full">
          <FormField label={t('warehouse.detail.scanLabel')}>
            <input
              ref={input}
              className="input ev-control"
              autoComplete="off"
              autoFocus
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </FormField>
        </div>
        <FormField label={t('warehouse.detail.condition')}>
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
        <FormField label={t('warehouse.detail.location')}>
          <select
            className="select ev-control"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            <option value="">{t('warehouse.detail.keepLocation')}</option>
            {(locations.data ?? [])
              .filter((l) => l.active)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </FormField>
        <div className="ev-form-grid__full">
          <FormField label={t('warehouse.detail.returnNote')}>
            <input
              className="input ev-control"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </FormField>
        </div>
        <div className="ev-form-grid__full ev-actions">
          <Button type="submit" variant="primary" icon={mdiKeyboardReturn} loading={busy}>
            {t('warehouse.detail.returnScan')}
          </Button>
          <Button
            variant="success"
            icon={mdiCheckAll}
            onClick={() => (unresolved.length > 0 ? setConfirmFinish(true) : finish(false))}
          >
            {t('warehouse.detail.finishReturn')}
          </Button>
        </div>
      </form>
      {feedback && (
        <div role="alert" className={`alert ${feedback.ok ? 'alert-success' : 'alert-error'}`}>
          <span>{feedback.text}</span>
        </div>
      )}
      {confirmFinish && (
        <ConfirmModal
          title={t('warehouse.detail.finishReturn')}
          message={t('warehouse.detail.finishConfirm', {
            codes: unresolved.map((i) => i.assetCode).join(', '),
          })}
          confirmLabel={t('warehouse.detail.finishReturn')}
          onConfirm={() => finish(true)}
          onClose={() => setConfirmFinish(false)}
        />
      )}
    </>
  );
}
