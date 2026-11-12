import { useState, type FormEvent } from 'react';
import { mdiContentSave } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { createProduct, updateProduct } from '@eventra/api-client';
import {
  PRICING_UNITS,
  type CategoryDto,
  type PricingUnit,
  type ProductDto,
} from '@eventra/shared';
import { api } from '@/api';
import { Button } from '@/components/ui/Button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { notify } from '@/lib/notifications';

interface ProductModalProps {
  product?: ProductDto;
  categories: CategoryDto[];
  readOnly: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export function ProductModal({
  product,
  categories,
  readOnly,
  onClose,
  onChanged,
}: ProductModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(product?.name ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? '');
  const [pricingUnit, setPricingUnit] = useState<PricingUnit>(product?.pricingUnit ?? 'PCS');
  const [unitLabel, setUnitLabel] = useState(product?.unitLabel ?? '');
  const [price, setPrice] = useState(String(product?.price ?? 0));
  const [deposit, setDeposit] = useState(String(product?.deposit ?? 0));
  const [active, setActive] = useState(product?.active ?? true);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const input = {
        name,
        sku: sku || undefined,
        categoryId,
        pricingUnit,
        unitLabel,
        price: Number(price),
        deposit: Number(deposit),
        active,
      };
      if (product) await updateProduct(api, product.id, input);
      else await createProduct(api, input);
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
    <Modal open title={product ? product.name : t('products.new')} onClose={onClose} wide>
      <form onSubmit={submit}>
        <fieldset disabled={readOnly} className="ev-form-grid">
          <FormField label={t('products.name')}>
            <input
              className="input ev-control"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
          <FormField label={t('products.sku')}>
            <input
              className="input ev-control"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />
          </FormField>
          <FormField label={t('products.category')}>
            <SearchSelect
              ariaLabel={t('products.category')}
              value={categoryId}
              onChange={setCategoryId}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
          </FormField>
          <FormField label={t('products.pricingUnit')}>
            <select
              className="select ev-control"
              value={pricingUnit}
              onChange={(e) => setPricingUnit(e.target.value as PricingUnit)}
            >
              {PRICING_UNITS.map((u) => (
                <option key={u} value={u}>
                  {t(`products.units.${u}`)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t('products.unitLabel')}>
            <input
              className="input ev-control"
              required
              value={unitLabel}
              onChange={(e) => setUnitLabel(e.target.value)}
            />
          </FormField>
          <FormField label={t('products.price')}>
            <CurrencyInput required value={price} onChange={setPrice} />
          </FormField>
          <FormField label={t('products.deposit')}>
            <CurrencyInput required value={deposit} onChange={setDeposit} />
          </FormField>
          <label className="label ev-toggle-row">
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            {t('common.active')}
          </label>
        </fieldset>
        {!readOnly && (
          <div className="modal-action">
            <Button
              type="submit"
              variant="primary"
              icon={mdiContentSave}
              loading={saving}
              disabled={!categoryId}
            >
              {t('common.save')}
            </Button>
          </div>
        )}
      </form>
    </Modal>
  );
}
