import { useState, type FormEvent } from 'react';
import { mdiContentSave } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { createAsset, updateAsset } from '@eventra/api-client';
import {
  ASSET_CONDITIONS,
  type AssetCondition,
  type AssetDto,
  type LocationDto,
  type ProductDto,
} from '@eventra/shared';
import { api } from '@/api';
import { Button } from '@/components/ui/Button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { notify } from '@/lib/notifications';

interface AssetModalProps {
  /** Kosong = aset baru. */
  asset?: AssetDto;
  products: ProductDto[];
  locations: LocationDto[];
  canSeeCost: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export function AssetModal({
  asset,
  products,
  locations,
  canSeeCost,
  onClose,
  onChanged,
}: AssetModalProps) {
  const { t } = useTranslation();
  const [productId, setProductId] = useState(asset?.productId ?? '');
  const [serial, setSerial] = useState(asset?.serial ?? '');
  const [quantity, setQuantity] = useState('1');
  const qty = Math.max(1, Number(quantity) || 1);
  const [condition, setCondition] = useState<AssetCondition>(asset?.condition ?? 'GOOD');
  const [locationId, setLocationId] = useState(asset?.locationId ?? '');
  // Aset baru: kolom lokasi tampil kosong sampai dipilih (kosong = tanpa lokasi).
  const [locationPicked, setLocationPicked] = useState(Boolean(asset));
  const [supplier, setSupplier] = useState(asset?.supplier ?? '');
  const [brand, setBrand] = useState(asset?.brand ?? '');
  const [batchLabel, setBatchLabel] = useState(asset?.batchLabel ?? '');
  const [purchaseDate, setPurchaseDate] = useState(asset?.purchaseDate ?? '');
  const [purchasePrice, setPurchasePrice] = useState(
    asset?.purchasePrice === null || asset?.purchasePrice === undefined
      ? ''
      : String(asset.purchasePrice),
  );
  const [notes, setNotes] = useState(asset?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (asset) {
        await updateAsset(api, asset.id, {
          serial,
          locationId: locationId || null,
          brand,
          batchLabel,
          supplier,
          purchaseDate: purchaseDate || null,
          ...(canSeeCost
            ? { purchasePrice: purchasePrice === '' ? null : Number(purchasePrice) }
            : {}),
          notes,
        });
      } else {
        await createAsset(api, {
          productId,
          quantity: qty,
          serial: qty > 1 ? '' : serial,
          condition,
          locationId: locationId || undefined,
          brand,
          batchLabel,
          supplier,
          purchaseDate: purchaseDate || undefined,
          ...(canSeeCost && purchasePrice !== '' ? { purchasePrice: Number(purchasePrice) } : {}),
          notes,
        });
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

  return (
    <Modal open title={asset ? asset.code : t('assets.new')} onClose={onClose} wide>
      <form onSubmit={submit}>
        <fieldset className="ev-form-grid">
          <FormField label={t('assets.product')}>
            <SearchSelect
              ariaLabel={t('assets.product')}
              disabled={Boolean(asset)}
              value={productId}
              onChange={setProductId}
              options={products.map((p) => ({ value: p.id, label: p.name }))}
            />
          </FormField>
          {!asset && (
            <FormField label={t('assets.qty')}>
              <input
                className="input ev-control"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(/\D/g, '').slice(0, 3))}
              />
            </FormField>
          )}
          <FormField label={t('assets.serial')}>
            <input
              className="input ev-control"
              disabled={!asset && qty > 1}
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
            />
          </FormField>
          {!asset && (
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
          )}
          <FormField label={t('assets.location')}>
            <SearchSelect
              ariaLabel={t('assets.location')}
              value={locationPicked ? locationId : '__unset__'}
              onChange={(v) => {
                setLocationId(v);
                setLocationPicked(true);
              }}
              options={[
                { value: '', label: t('assets.noLocation') },
                ...locations
                  .filter((l) => l.active || l.id === asset?.locationId)
                  .map((l) => ({ value: l.id, label: l.name })),
              ]}
            />
          </FormField>
          <FormField label={t('assets.brand')}>
            <input
              className="input ev-control"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            />
          </FormField>
          <FormField label={t('assets.batchLabel')}>
            <input
              className="input ev-control"
              value={batchLabel}
              onChange={(e) => setBatchLabel(e.target.value)}
            />
          </FormField>
          <FormField label={t('assets.supplier')}>
            <input
              className="input ev-control"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            />
          </FormField>
          <FormField label={t('assets.purchaseDate')}>
            <input
              type="date"
              className="input ev-control"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </FormField>
          {canSeeCost && (
            <FormField label={t('assets.purchasePrice')}>
              <CurrencyInput value={purchasePrice} onChange={setPurchasePrice} />
            </FormField>
          )}
          <div className="ev-form-grid__full">
            <FormField label={t('assets.notes')}>
              <textarea
                className="textarea ev-control"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </FormField>
          </div>
        </fieldset>
        <div className="modal-action">
          <Button
            type="submit"
            variant="primary"
            icon={mdiContentSave}
            loading={saving}
            disabled={!productId}
          >
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
