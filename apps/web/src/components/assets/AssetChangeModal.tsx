import { useState, type FormEvent } from 'react';
import { mdiContentSave } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { changeAssetCondition, changeAssetStatus } from '@eventra/api-client';
import {
  ASSET_CONDITIONS,
  MANUAL_STATUS_TRANSITIONS,
  type AssetCondition,
  type AssetDto,
  type AssetStatus,
} from '@eventra/shared';
import { api } from '@/api';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { notify } from '@/lib/notifications';

interface AssetChangeModalProps {
  kind: 'condition' | 'status';
  asset: AssetDto;
  onClose: () => void;
  onChanged: () => void;
}

/** Ubah kondisi atau status aset (manual); setiap perubahan masuk riwayat append-only. */
export function AssetChangeModal({ kind, asset, onClose, onChanged }: AssetChangeModalProps) {
  const { t } = useTranslation();
  const options: string[] =
    kind === 'condition'
      ? ASSET_CONDITIONS.filter((c) => c !== asset.condition)
      : [...MANUAL_STATUS_TRANSITIONS[asset.status]];
  const [value, setValue] = useState<string>(options[0] ?? '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const empty = options.length === 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (kind === 'condition') {
        await changeAssetCondition(api, asset.id, { condition: value as AssetCondition, note });
      } else {
        await changeAssetStatus(api, asset.id, { status: value as AssetStatus, note });
      }
      notify('success', t('common.saved'));
      onChanged();
      onClose();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    } finally {
      setSaving(false);
    }
  };

  const isCondition = kind === 'condition';
  return (
    <Modal
      open
      title={isCondition ? t('assets.detail.changeCondition') : t('assets.detail.changeStatus')}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        {empty ? (
          <p>{t('assets.detail.noTransitions')}</p>
        ) : (
          <fieldset className="ev-form-grid">
            <div className="ev-form-grid__full">
              <FormField
                label={isCondition ? t('assets.detail.newCondition') : t('assets.detail.newStatus')}
              >
                <select
                  className="select ev-control"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                >
                  {options.map((o) => (
                    <option key={o} value={o}>
                      {isCondition ? t(`assets.conditions.${o}`) : t(`assets.statuses.${o}`)}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            {isCondition && (
              <p className="ev-form-grid__full ev-table__hint">{t('assets.detail.damagedNote')}</p>
            )}
            <div className="ev-form-grid__full">
              <FormField label={t('common.note')}>
                <textarea
                  className="textarea ev-control"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </FormField>
            </div>
          </fieldset>
        )}
        {!empty && (
          <div className="modal-action">
            <Button type="submit" variant="primary" icon={mdiContentSave} loading={saving}>
              {t('common.save')}
            </Button>
          </div>
        )}
      </form>
    </Modal>
  );
}
