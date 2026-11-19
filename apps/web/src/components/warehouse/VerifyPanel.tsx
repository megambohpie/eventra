import { useState } from 'react';
import { mdiBarcodeScan, mdiCheckboxMarkedOutline } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { ApiRequestError, scanPickList } from '@eventra/api-client';
import type { PickListDto } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Scanner, type ScanValue } from '@/components/ui/Scanner';
import { PickItemStatusBadge } from '@/components/warehouse/badges';
import { notify } from '@/lib/notifications';

interface VerifyPanelProps {
  pick: PickListDto;
  onChanged: () => void;
}

/**
 * Verifikasi akhir cara kedua selain scan ulang: checklist per aset. Owner/Admin (`scan.manual`)
 * dapat mencentang lalu **Verifikasi terpilih** (tiap aset tercatat sebagai scan event MANUAL);
 * peran lain checklist hanya-lihat dan wajib scan QR. Tombol kamera membuka scanner multi-scan.
 */
export function VerifyPanel({ pick, onChanged }: VerifyPanelProps) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const manualAllowed = can('scan.manual');
  const [selected, setSelected] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checklist = pick.items.filter((i) => i.status === 'PICKED' || i.status === 'VERIFIED');
  const pending = checklist.filter((i) => i.status === 'PICKED');
  const verifiedCount = checklist.length - pending.length;
  const pendingSelected = selected.filter((id) => pending.some((i) => i.id === id));
  const allSelected = pending.length > 0 && pendingSelected.length === pending.length;

  const message = (e: unknown): string =>
    e instanceof ApiRequestError
      ? t(`errors.${e.code}`, { defaultValue: e.message })
      : t('scanner.failed');

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  /** Centang tanpa scan: tiap aset terpilih diverifikasi berurutan (berhenti pada kegagalan pertama). */
  const verifySelected = async () => {
    setError(null);
    let done = 0;
    try {
      for (const item of pending.filter((i) => pendingSelected.includes(i.id))) {
        await scanPickList(api, pick.id, { action: 'VERIFY', assetCode: item.assetCode });
        done += 1;
      }
      notify('success', t('warehouse.detail.verifyChecklistOk', { count: done }));
    } catch (e) {
      setError(message(e));
    } finally {
      setSelected([]);
      if (done > 0) onChanged();
    }
  };

  const scanFromCamera = async (value: ScanValue): Promise<string> => {
    try {
      const out = await scanPickList(api, pick.id, { action: 'VERIFY', ...value });
      onChanged();
      return t('warehouse.detail.verifiedOk', { code: out.item.assetCode });
    } catch (e) {
      throw new Error(message(e), { cause: e });
    }
  };

  return (
    <>
      {checklist.length > 0 && (
        <div className="ev-checklist">
          <div className="ev-checklist__head">
            <label className="ev-checklist__all">
              <input
                type="checkbox"
                className="checkbox checkbox-sm checkbox-primary"
                disabled={!manualAllowed || pending.length === 0}
                checked={allSelected}
                onChange={() => setSelected(allSelected ? [] : pending.map((i) => i.id))}
              />
              {t('warehouse.detail.selectAll')}
            </label>
            <span className="ev-hint">
              {t('warehouse.detail.verifyProgress', {
                done: verifiedCount,
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
                    checked={item.status === 'VERIFIED' || selected.includes(item.id)}
                    disabled={item.status !== 'PICKED' || !manualAllowed}
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
                {item.status === 'VERIFIED' && <PickItemStatusBadge status={item.status} />}
              </li>
            ))}
          </ul>
          {!manualAllowed && <p className="ev-hint">{t('warehouse.detail.checklistScanOnly')}</p>}
        </div>
      )}
      <div className="ev-actions">
        <Button variant="secondary" icon={mdiBarcodeScan} onClick={() => setScanning(true)}>
          {t('warehouse.detail.openScanner')}
        </Button>
        {manualAllowed && (
          <Button
            variant="accent"
            icon={mdiCheckboxMarkedOutline}
            disabled={pendingSelected.length === 0}
            onClick={verifySelected}
          >
            {t('warehouse.detail.verifySelected', { count: pendingSelected.length })}
          </Button>
        )}
      </div>
      {error && (
        <div role="alert" className="alert alert-error">
          <span>{error}</span>
        </div>
      )}
      <Scanner
        open={scanning}
        title={t('warehouse.detail.modeVerify')}
        allowManual={manualAllowed}
        onScan={scanFromCamera}
        onClose={() => setScanning(false)}
      />
    </>
  );
}
