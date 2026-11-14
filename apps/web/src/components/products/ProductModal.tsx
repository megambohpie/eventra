import { useState, type FormEvent } from 'react';
import { mdiContentSave } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import {
  createProduct,
  deleteProductPhoto,
  updateProduct,
  uploadProductPhoto,
} from '@eventra/api-client';
import {
  effectiveUnitPrice,
  PRICING_UNITS,
  STOCK_MODES,
  type CategoryDto,
  type PricingUnit,
  type ProductDto,
  type StockMode,
} from '@eventra/shared';
import { api } from '@/api';
import { ProductPhotoField } from '@/components/products/ProductPhotoField';
import { Button } from '@/components/ui/Button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { FormField } from '@/components/ui/FormField';
import { randomSkuSuffix, suggestSku } from '@/lib/sku';
import { Modal } from '@/components/ui/Modal';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { formatRupiah } from '@/lib/format';
import { notify } from '@/lib/notifications';

interface ProductModalProps {
  product?: ProductDto;
  categories: CategoryDto[];
  /** Produk kelompok "per meter" yang dapat menjadi tujuan kabinet anggota. */
  pools: ProductDto[];
  readOnly: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export function ProductModal({
  product,
  categories,
  pools,
  readOnly,
  onClose,
  onChanged,
}: ProductModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(product?.name ?? '');
  const [skuInput, setSkuInput] = useState(product?.sku ?? '');
  // Produk baru: SKU diusulkan otomatis sampai pengguna mengetiknya sendiri.
  const [skuEdited, setSkuEdited] = useState(Boolean(product));
  const [skuSuffix] = useState(randomSkuSuffix);
  // Kategori opsional: kosong = produk tanpa kategori.
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const [pricingUnit, setPricingUnit] = useState<PricingUnit>(product?.pricingUnit ?? 'PCS');
  const [unitLabel, setUnitLabel] = useState(product?.unitLabel ?? '');
  const [widthCm, setWidthCm] = useState(product?.widthCm ? String(product.widthCm) : '');
  const [heightCm, setHeightCm] = useState(product?.heightCm ? String(product.heightCm) : '');
  const [price, setPrice] = useState(String(product?.price ?? 0));
  const [deposit, setDeposit] = useState(String(product?.deposit ?? 0));
  const [active, setActive] = useState(product?.active ?? true);
  const [stockMode, setStockMode] = useState<StockMode>(product?.stockMode ?? 'TRACKED');
  const [areaPoolId, setAreaPoolId] = useState(product?.areaPoolId ?? '');
  // Ukuran dipakai kabinet berQR (dan harga per m²); produk kelompok/tak terbatas tidak butuh ukuran.
  const showSize = stockMode === 'TRACKED' || pricingUnit === 'AREA';
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const categoryName = categories.find((c) => c.id === categoryId)?.name ?? '';
  const sku = skuEdited ? skuInput : suggestSku(categoryName, name, skuSuffix);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const input = {
        name,
        sku: sku || undefined,
        categoryId: categoryId || null,
        pricingUnit,
        unitLabel,
        price: Number(price),
        deposit: Number(deposit),
        active,
        stockMode,
        areaPoolId: stockMode === 'TRACKED' && areaPoolId ? areaPoolId : null,
        widthCm: showSize && widthCm ? Number(widthCm) : null,
        heightCm: showSize && heightCm ? Number(heightCm) : null,
      };
      const saved = product
        ? await updateProduct(api, product.id, input)
        : await createProduct(api, input);
      // Foto opsional: hanya diunggah/dihapus bila pengguna memilihnya.
      if (photo) await uploadProductPhoto(api, saved.id, photo);
      else if (photoRemoved) await deleteProductPhoto(api, saved.id);
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
              onChange={(e) => {
                setSkuInput(e.target.value);
                setSkuEdited(true);
              }}
            />
          </FormField>
          <FormField label={t('products.category')}>
            <SearchSelect
              ariaLabel={t('products.category')}
              value={categoryId}
              onChange={setCategoryId}
              options={[
                { value: '', label: t('products.noCategory') },
                ...categories.map((c) => ({ value: c.id, label: c.name })),
              ]}
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
          {showSize && (
            <div className="ev-form-grid__full">
              {/* Panjang (widthCm) dan lebar (heightCm) kabinet dalam satu baris. */}
              <div className="ev-form-grid">
                <FormField label={t('products.widthCm')}>
                  <input
                    className="input ev-control"
                    inputMode="numeric"
                    required={Boolean(heightCm) || pricingUnit === 'AREA' || Boolean(areaPoolId)}
                    value={widthCm}
                    onChange={(e) => setWidthCm(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  />
                </FormField>
                <FormField label={t('products.heightCm')}>
                  <input
                    className="input ev-control"
                    inputMode="numeric"
                    required={Boolean(widthCm) || pricingUnit === 'AREA' || Boolean(areaPoolId)}
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  />
                </FormField>
              </div>
              <p className="ev-hint">{t('products.sizeHint')}</p>
            </div>
          )}
          <FormField label={pricingUnit === 'AREA' ? t('products.priceArea') : t('products.price')}>
            <CurrencyInput required value={price} onChange={setPrice} />
          </FormField>
          {pricingUnit === 'AREA' && (
            <p className="ev-hint ev-form-grid__full">
              {widthCm && heightCm
                ? t('products.unitPricePreview', {
                    price: formatRupiah(
                      effectiveUnitPrice({
                        pricingUnit,
                        price: Number(price),
                        widthCm: Number(widthCm),
                        heightCm: Number(heightCm),
                      }),
                    ),
                    width: widthCm,
                    height: heightCm,
                  })
                : t('products.needSizeForArea')}
            </p>
          )}
          <FormField label={t('products.deposit')}>
            <CurrencyInput required value={deposit} onChange={setDeposit} />
          </FormField>
          <ProductPhotoField
            productId={product?.id}
            hasPhoto={product?.hasPhoto ?? false}
            file={photo}
            removed={photoRemoved}
            readOnly={readOnly}
            onFile={setPhoto}
            onRemove={setPhotoRemoved}
          />
          <div className="ev-form-grid__full">
            <FormField label={t('products.stockModeLabel')}>
              <select
                className="select ev-control"
                value={stockMode}
                onChange={(e) => {
                  const next = e.target.value as StockMode;
                  setStockMode(next);
                  if (next !== 'TRACKED') setAreaPoolId('');
                }}
              >
                {STOCK_MODES.map((m) => (
                  <option key={m} value={m}>
                    {t(`products.stockModes.${m}`)}
                  </option>
                ))}
              </select>
            </FormField>
            <p className="ev-hint">{t(`products.stockModeHints.${stockMode}`)}</p>
          </div>
          {stockMode === 'TRACKED' && pools.length > 0 && (
            <div className="ev-form-grid__full">
              <FormField label={t('products.areaPool')}>
                <SearchSelect
                  ariaLabel={t('products.areaPool')}
                  value={areaPoolId}
                  onChange={setAreaPoolId}
                  options={[
                    { value: '', label: t('products.areaPoolNone') },
                    ...pools.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </FormField>
              <p className="ev-hint">{t('products.areaPoolHint')}</p>
            </div>
          )}
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
            <Button type="submit" variant="primary" icon={mdiContentSave} loading={saving}>
              {t('common.save')}
            </Button>
          </div>
        )}
      </form>
    </Modal>
  );
}
