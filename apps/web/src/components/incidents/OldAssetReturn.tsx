import { useState, type FormEvent } from 'react';
import { mdiBarcodeScan } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { ApiRequestError, scanReturn } from '@eventra/api-client';
import { ASSET_CONDITIONS, type AssetCondition, type ReplacementTaskDto } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { ConditionBadge } from '@/components/assets/badges';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { formatDateTime } from '@/lib/format';
import { notify } from '@/lib/notifications';

const ASSET_CODE = /^AST-[A-Z0-9-]+$/i;

interface OldAssetReturnProps {
  task: ReplacementTaskDto;
  onChanged: () => void;
}

/**
 * Aset rusak setelah pengganti diterima: dibawa kembali lebih awal (mis. oleh staf pengantar
 * pengganti, dipindai gudang di sini) atau dibiarkan ikut pengembalian pesanan saat sewa selesai.
 */
export function OldAssetReturn({ task, onChanged }: OldAssetReturnProps) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [value, setValue] = useState('');
  const [condition, setCondition] = useState<AssetCondition>('DAMAGED');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const back = task.oldAssetReturn;

  if (task.status !== 'RECEIVED') return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const raw = value.trim();
    if (!raw) return;
    const manual = ASSET_CODE.test(raw);
    if (manual && !can('scan.manual')) {
      setFeedback(t('replacements.oldReturn.qrOnly'));
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await scanReturn(api, task.pickListId, {
        ...(manual ? { assetCode: raw.toUpperCase() } : { qrToken: raw }),
        condition,
      });
      notify('success', t('replacements.oldReturn.done'));
      setValue('');
      onChanged();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setFeedback(t(`errors.${error.code}`, { defaultValue: error.message }));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2 className="ev-section-title">
        {t('replacements.oldReturn.title', { code: task.oldAsset.code })}
      </h2>
      {back.returnedAt ? (
        <p>
          {t('replacements.oldReturn.returnedAt', { at: formatDateTime(back.returnedAt) })}{' '}
          {back.condition && <ConditionBadge condition={back.condition} />}
        </p>
      ) : (
        <>
          <p className="ev-hint">
            {back.requestedAt
              ? t('replacements.oldReturn.requested', { at: formatDateTime(back.requestedAt) })
              : t('replacements.oldReturn.hint')}
          </p>
          {can('warehouse.write') && (
            <form className="ev-scan__form" onSubmit={submit}>
              <FormField label={t('warehouse.detail.scanLabel')}>
                <input
                  className="input ev-control"
                  autoComplete="off"
                  placeholder={t('warehouse.detail.scanPlaceholder')}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </FormField>
              <FormField label={t('assets.condition')}>
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
              <Button type="submit" variant="primary" icon={mdiBarcodeScan} loading={busy}>
                {t('replacements.oldReturn.action')}
              </Button>
            </form>
          )}
          {feedback && (
            <div role="alert" className="alert alert-error">
              <span>{feedback}</span>
            </div>
          )}
        </>
      )}
    </>
  );
}
