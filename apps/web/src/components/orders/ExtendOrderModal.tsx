import { useState, type FormEvent } from 'react';
import { mdiCalendarPlus } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { extendOrder, previewOrderExtension } from '@eventra/api-client';
import type { OrderDto } from '@eventra/shared';
import { api } from '@/api';
import { Button } from '@/components/ui/Button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { useResource } from '@/hooks/useResource';
import { formatDate, formatRupiah } from '@/lib/format';
import { notify } from '@/lib/notifications';

const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Perpanjang sewa: pilih tanggal selesai baru, lihat pratinjau biaya dan kecukupan stok untuk hari
 * tambahan, lalu konfirmasi. Pesanan borongan mengisi biaya tambahan secara manual.
 */
export function ExtendOrderModal({
  order,
  onClose,
  onDone,
}: {
  order: OrderDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const lump = order.pricingMode === 'LUMP';
  const minDate = addDays(order.endDate, 1);
  const [newEnd, setNewEnd] = useState(minDate);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const validDate = newEnd >= minDate;
  const preview = useResource(
    () =>
      validDate
        ? previewOrderExtension(api, order.id, {
            newEndDate: newEnd,
            ...(lump && amount !== '' ? { extraAmount: Number(amount) } : {}),
          })
        : Promise.resolve(undefined),
    `extend-${order.id}-${newEnd}-${amount}`,
  );
  const p = preview.data;
  const canSubmit = validDate && !!p && p.available && (!lump || amount !== '');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      await extendOrder(api, order.id, {
        newEndDate: newEnd,
        ...(lump ? { extraAmount: Number(amount) } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      notify('success', t('orders.extend.done'));
      onDone();
      onClose();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={t('orders.extend.title')} onClose={onClose}>
      <form className="ev-form" onSubmit={submit}>
        <p className="ev-hint">
          {t('orders.extend.current', {
            start: formatDate(order.startDate),
            end: formatDate(order.endDate),
          })}
        </p>
        <FormField label={t('orders.extend.newEnd')}>
          <input
            type="date"
            className="input ev-control"
            min={minDate}
            required
            value={newEnd}
            onChange={(e) => setNewEnd(e.target.value)}
          />
        </FormField>
        {lump && (
          <FormField label={t('orders.extend.amount')}>
            <CurrencyInput value={amount} onChange={setAmount} required />
            <span className="ev-hint">{t('orders.extend.amountHint')}</span>
          </FormField>
        )}
        {p && (
          <div
            role="alert"
            className={`alert ${p.available ? 'alert-info' : 'alert-error'} ev-notice`}
          >
            <div>
              <strong>{t('orders.extend.extraDays', { count: p.extraDays })}</strong>
              {p.amount != null && (
                <p className="ev-hint">
                  {t('orders.extend.cost', { amount: formatRupiah(p.amount) })}
                </p>
              )}
              {p.available ? (
                <p className="ev-hint">{t('orders.extend.stockOk')}</p>
              ) : (
                <>
                  <p className="ev-hint">{t('orders.extend.stockShort')}</p>
                  <ul className="ev-hint">
                    {p.availability.items
                      .filter((i) => !i.available)
                      .map((i) => (
                        <li key={i.productId}>
                          {i.productName}: {t('orders.extend.requested', { count: i.requested })},{' '}
                          {t('orders.extend.max', { count: i.maxQuantity })}
                        </li>
                      ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}
        <FormField label={t('orders.extend.note')}>
          <textarea
            className="textarea ev-control"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>
        <div className="modal-action">
          <Button
            type="submit"
            variant="primary"
            icon={mdiCalendarPlus}
            loading={saving}
            disabled={!canSubmit}
          >
            {t('orders.extend.confirm')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
