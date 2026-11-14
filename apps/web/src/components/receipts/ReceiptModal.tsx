import { useState, type FormEvent } from 'react';
import { mdiContentSave, mdiDelete, mdiPlus } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { createReceipt, updateReceipt } from '@eventra/api-client';
import {
  ASSET_CONDITIONS,
  RECEIPT_SOURCES,
  type AssetCondition,
  type LocationDto,
  type ProductDto,
  type ReceiptDto,
  type ReceiptSource,
} from '@eventra/shared';
import { api } from '@/api';
import { Button } from '@/components/ui/Button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { notify } from '@/lib/notifications';
import { suggestSourceRef } from '@/lib/receiptRef';
import { randomSkuSuffix } from '@/lib/sku';

interface ItemDraft {
  key: number;
  productId: string;
  quantity: string;
  unitCost: string;
  condition: AssetCondition;
  serials: string;
}

interface ReceiptModalProps {
  /** Draft yang diubah; kosong = penerimaan baru. */
  receipt?: ReceiptDto;
  products: ProductDto[];
  locations: LocationDto[];
  canSeeCost: boolean;
  onClose: () => void;
  onChanged: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function ReceiptModal({
  receipt,
  products,
  locations,
  canSeeCost,
  onClose,
  onChanged,
}: ReceiptModalProps) {
  const { t } = useTranslation();
  const activeLocations = locations.filter((l) => l.active || l.id === receipt?.locationId);
  const [source, setSource] = useState<ReceiptSource>(receipt?.source ?? 'PURCHASE');
  const [refInput, setRefInput] = useState(receipt?.sourceRef ?? '');
  // Penerimaan baru: referensi diusulkan otomatis sampai pengguna mengetiknya sendiri.
  const [refEdited, setRefEdited] = useState(Boolean(receipt));
  const [refSuffix] = useState(randomSkuSuffix);
  const [supplier, setSupplier] = useState(receipt?.supplier ?? '');
  const [locationId, setLocationId] = useState(receipt?.locationId ?? activeLocations[0]?.id ?? '');
  const [receivedDate, setReceivedDate] = useState(receipt?.receivedDate ?? today());
  const [note, setNote] = useState(receipt?.note ?? '');
  const sourceRef = refEdited ? refInput : suggestSourceRef(source, receivedDate, refSuffix);
  const [nextKey, setNextKey] = useState(receipt?.items.length ?? 1);
  const [items, setItems] = useState<ItemDraft[]>(
    receipt
      ? receipt.items.map((item, key) => ({
          key,
          productId: item.productId,
          quantity: String(item.quantity),
          unitCost:
            item.unitCost === null || item.unitCost === undefined ? '' : String(item.unitCost),
          condition: item.condition,
          serials: item.serials.join('\n'),
        }))
      : [
          {
            key: 0,
            productId: products[0]?.id ?? '',
            quantity: '1',
            unitCost: '',
            condition: 'GOOD',
            serials: '',
          },
        ],
  );
  const [saving, setSaving] = useState(false);

  const patchItem = (key: number, patch: Partial<ItemDraft>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const input = {
        source,
        sourceRef,
        supplier,
        locationId,
        receivedDate,
        note,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: Number(i.quantity),
          ...(canSeeCost && i.unitCost !== '' ? { unitCost: Number(i.unitCost) } : {}),
          condition: i.condition,
          serials: i.serials
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        })),
      };
      if (receipt) await updateReceipt(api, receipt.id, input);
      else await createReceipt(api, input);
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
    <Modal
      open
      title={receipt ? `${t('receipts.edit')} ${receipt.number}` : t('receipts.new')}
      onClose={onClose}
      wide
    >
      <form onSubmit={submit}>
        <fieldset className="ev-form-grid">
          <FormField label={t('receipts.source')}>
            <select
              className="select ev-control"
              value={source}
              onChange={(e) => setSource(e.target.value as ReceiptSource)}
            >
              {RECEIPT_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {t(`receipts.sources.${s}`)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t('receipts.sourceRef')}>
            <input
              className="input ev-control"
              value={sourceRef}
              onChange={(e) => {
                setRefInput(e.target.value);
                setRefEdited(true);
              }}
            />
          </FormField>
          <FormField label={t('receipts.supplier')}>
            <input
              className="input ev-control"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            />
          </FormField>
          <FormField label={t('receipts.location')}>
            <SearchSelect
              ariaLabel={t('receipts.location')}
              value={locationId}
              onChange={setLocationId}
              options={activeLocations.map((l) => ({ value: l.id, label: l.name }))}
            />
          </FormField>
          <FormField label={t('receipts.receivedDate')}>
            <input
              type="date"
              className="input ev-control"
              required
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
            />
          </FormField>
          <FormField label={t('receipts.note')}>
            <input
              className="input ev-control"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </FormField>
        </fieldset>

        <h3 className="ev-section-title">{t('receipts.items')}</h3>
        <div className="ev-receipt-items">
          {items.map((item) => (
            <fieldset key={item.key} className="ev-receipt-item">
              <div className="ev-form-grid">
                <FormField label={t('receipts.product')}>
                  <SearchSelect
                    ariaLabel={t('receipts.product')}
                    value={item.productId}
                    onChange={(value) => patchItem(item.key, { productId: value })}
                    options={products.map((p) => ({ value: p.id, label: p.name }))}
                  />
                </FormField>
                <FormField label={t('receipts.quantity')}>
                  <input
                    type="number"
                    className="input ev-control"
                    min={1}
                    max={500}
                    step={1}
                    required
                    value={item.quantity}
                    onChange={(e) => patchItem(item.key, { quantity: e.target.value })}
                  />
                </FormField>
                <FormField label={t('receipts.condition')}>
                  <select
                    className="select ev-control"
                    value={item.condition}
                    onChange={(e) =>
                      patchItem(item.key, { condition: e.target.value as AssetCondition })
                    }
                  >
                    {ASSET_CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {t(`assets.conditions.${c}`)}
                      </option>
                    ))}
                  </select>
                </FormField>
                {canSeeCost && (
                  <FormField label={t('receipts.unitCost')}>
                    <CurrencyInput
                      value={item.unitCost}
                      onChange={(v) => patchItem(item.key, { unitCost: v })}
                    />
                  </FormField>
                )}
                <div className="ev-form-grid__full">
                  <FormField label={t('receipts.serials')}>
                    <textarea
                      className="textarea ev-control"
                      rows={2}
                      value={item.serials}
                      onChange={(e) => patchItem(item.key, { serials: e.target.value })}
                    />
                  </FormField>
                </div>
              </div>
              {items.length > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={mdiDelete}
                  onClick={() => setItems((prev) => prev.filter((i) => i.key !== item.key))}
                >
                  {t('receipts.removeItem')}
                </Button>
              )}
            </fieldset>
          ))}
        </div>
        <Button
          size="sm"
          variant="secondary"
          icon={mdiPlus}
          onClick={() => {
            setItems((prev) => [
              ...prev,
              {
                key: nextKey,
                productId: products[0]?.id ?? '',
                quantity: '1',
                unitCost: '',
                condition: 'GOOD',
                serials: '',
              },
            ]);
            setNextKey((k) => k + 1);
          }}
        >
          {t('receipts.addItem')}
        </Button>

        <div className="modal-action">
          <Button
            type="submit"
            variant="primary"
            icon={mdiContentSave}
            loading={saving}
            disabled={!locationId}
          >
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
