import { useRef, useState, type FormEvent } from 'react';
import { mdiBarcodeScan, mdiCheckAll, mdiCheckboxMarkedOutline, mdiKeyboardReturn } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { ApiRequestError, completeReturn, listLocations, scanReturn } from '@eventra/api-client';
import { ASSET_CONDITIONS, type AssetCondition, type PickListDto } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { FormField } from '@/components/ui/FormField';
import { Scanner, type ScanValue } from '@/components/ui/Scanner';
import { PickItemStatusBadge } from '@/components/warehouse/badges';
import { useResource } from '@/hooks/useResource';
import { notify } from '@/lib/notifications';

const ASSET_CODE = /^AST-[A-Z0-9-]+$/i;

interface ReturnPanelProps {
  pick: PickListDto;
  onChanged: () => void;
}

/**
 * Pengembalian aset: checklist per aset (Owner/Admin dapat mencentang tanpa memindai, tercatat
 * MANUAL), tombol Scan kamera, atau ketik/tembak kode; lalu penyelesaian dengan konfirmasi selisih.
 */
export function ReturnPanel({ pick, onChanged }: ReturnPanelProps) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState('');
  const [condition, setCondition] = useState<AssetCondition>('GOOD');
  const [note, setNote] = useState('');
  const [locationId, setLocationId] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [missingCodes, setMissingCodes] = useState<string[]>([]);
  const locations = useResource(() => listLocations(api), 'locations');

  const unresolved = pick.items.filter((i) => i.status === 'DISPATCHED');
  const checklist = pick.items.filter((i) =>
    ['DISPATCHED', 'RETURNED', 'MISSING'].includes(i.status),
  );
  const returnedCount = checklist.filter((i) => i.status === 'RETURNED').length;
  const manualAllowed = can('scan.manual');
  const pendingSelected = selected.filter((id) => unresolved.some((i) => i.id === id));
  const allSelected = unresolved.length > 0 && pendingSelected.length === unresolved.length;

  const message = (error: unknown): string =>
    error instanceof ApiRequestError
      ? t(`errors.${error.code}`, { defaultValue: error.message })
      : t('scanner.failed');

  /** Satu aset kembali: dipakai input ketik, kamera, dan checklist. */
  const record = (value: ScanValue) =>
    scanReturn(api, pick.id, {
      ...value,
      condition,
      note,
      locationId: locationId || undefined,
    });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = token.trim();
    if (!value) return;
    setBusy(true);
    try {
      // Owner/Admin boleh mengetik kode aset (tercatat MANUAL); lainnya wajib memindai QR.
      const out = await record(
        ASSET_CODE.test(value) && manualAllowed
          ? { assetCode: value.toUpperCase() }
          : { qrToken: value },
      );
      setFeedback({
        ok: true,
        text: t('warehouse.detail.returnedOk', { code: out.item.assetCode }),
      });
      setToken('');
      setNote('');
      onChanged();
    } catch (error) {
      setFeedback({ ok: false, text: message(error) });
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  };

  const scanFromCamera = async (value: ScanValue): Promise<string> => {
    try {
      const out = await record(value);
      onChanged();
      return t('warehouse.detail.returnedOk', { code: out.item.assetCode });
    } catch (error) {
      throw new Error(message(error), { cause: error });
    }
  };

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  /** Centang tanpa scan: tiap aset terpilih dicatat berurutan (tercatat MANUAL di scan event). */
  const returnSelected = async (): Promise<boolean> => {
    const targets = unresolved.filter((i) => pendingSelected.includes(i.id));
    let done = 0;
    try {
      for (const item of targets) {
        await record({ assetCode: item.assetCode });
        done += 1;
      }
      notify('success', t('warehouse.detail.checklistOk', { count: done }));
      setNote('');
      return true;
    } catch (error) {
      setFeedback({ ok: false, text: message(error) });
      return false;
    } finally {
      setSelected([]);
      if (done > 0) onChanged();
    }
  };

  /** Aset yang sudah dicentang otomatis dicatat kembali dulu; hanya sisanya yang dianggap selisih. */
  const startFinish = async () => {
    if (pendingSelected.length > 0 && !(await returnSelected())) return;
    const remaining = unresolved.filter((i) => !pendingSelected.includes(i.id));
    if (remaining.length > 0) {
      setMissingCodes(remaining.map((i) => i.assetCode));
      setConfirmFinish(true);
    } else {
      await finish(false);
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
      {checklist.length > 0 && (
        <div className="ev-checklist">
          <div className="ev-checklist__head">
            <label className="ev-checklist__all">
              <input
                type="checkbox"
                className="checkbox checkbox-sm checkbox-primary"
                disabled={!manualAllowed || unresolved.length === 0}
                checked={allSelected}
                onChange={() => setSelected(allSelected ? [] : unresolved.map((i) => i.id))}
              />
              {t('warehouse.detail.selectAll')}
            </label>
            <span className="ev-hint">
              {t('warehouse.detail.checklistProgress', {
                done: returnedCount,
                total: checklist.length,
              })}
            </span>
          </div>
          <ul className="ev-checklist__list">
            {checklist.map((item) => (
              <li key={item.id} className="ev-checklist__item" data-status={item.status}>
                <label className="ev-checklist__label">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-primary"
                    checked={item.status === 'RETURNED' || selected.includes(item.id)}
                    disabled={item.status !== 'DISPATCHED' || !manualAllowed}
                    onChange={() => toggle(item.id)}
                  />
                  <span className="ev-checklist__text">
                    <strong>{item.assetCode}</strong>
                    <span className="ev-table__hint ev-table__hint--block">
                      {item.productName}
                      {item.serial && ` · SN ${item.serial}`}
                    </span>
                  </span>
                </label>
                {item.status === 'MISSING' && <PickItemStatusBadge status={item.status} />}
              </li>
            ))}
          </ul>
          {!manualAllowed && <p className="ev-hint">{t('warehouse.detail.checklistScanOnly')}</p>}
        </div>
      )}
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
          <Button variant="secondary" icon={mdiBarcodeScan} onClick={() => setScanning(true)}>
            {t('warehouse.detail.openScanner')}
          </Button>
          {manualAllowed && (
            <Button
              variant="accent"
              icon={mdiCheckboxMarkedOutline}
              disabled={pendingSelected.length === 0}
              onClick={async () => {
                await returnSelected();
              }}
            >
              {t('warehouse.detail.returnSelected', { count: pendingSelected.length })}
            </Button>
          )}
          <Button type="submit" variant="primary" icon={mdiKeyboardReturn} loading={busy}>
            {t('warehouse.detail.returnScan')}
          </Button>
          <Button variant="success" icon={mdiCheckAll} onClick={startFinish}>
            {t('warehouse.detail.finishReturn')}
          </Button>
        </div>
      </form>
      {feedback && (
        <div role="alert" className={`alert ${feedback.ok ? 'alert-success' : 'alert-error'}`}>
          <span>{feedback.text}</span>
        </div>
      )}
      <Scanner
        open={scanning}
        title={t('warehouse.detail.returnTitle')}
        allowManual={manualAllowed}
        onScan={scanFromCamera}
        onClose={() => setScanning(false)}
      />
      {confirmFinish && (
        <ConfirmModal
          title={t('warehouse.detail.finishReturn')}
          message={t('warehouse.detail.finishConfirm', {
            codes: missingCodes.join(', '),
          })}
          confirmLabel={t('warehouse.detail.finishReturn')}
          onConfirm={() => finish(true)}
          onClose={() => setConfirmFinish(false)}
        />
      )}
    </>
  );
}
