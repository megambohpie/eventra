import { useState } from 'react';
import { mdiContentSave, mdiDelete, mdiPlus } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { getProductBundle, saveProductBundle } from '@eventra/api-client';
import type { ProductDto } from '@eventra/shared';
import { api } from '@/api';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { useResource } from '@/hooks/useResource';
import { notify } from '@/lib/notifications';

interface Row {
  key: number;
  componentProductId: string;
  quantity: string;
}

interface BundleModalProps {
  product: ProductDto;
  /** Kandidat komponen (produk aktif). */
  candidates: ProductDto[];
  readOnly: boolean;
  onClose: () => void;
}

/** Konfigurasi 1 satuan sewa → N aset fisik (mis. 1 meter LED → 4 panel). */
export function BundleModal({ product, candidates, readOnly, onClose }: BundleModalProps) {
  const { t } = useTranslation();
  const { data, loading } = useResource(() => getProductBundle(api, product.id), product.id);
  if (loading && !data) {
    return (
      <Modal open title={t('products.bundle.title', { name: product.name })} onClose={onClose}>
        <Loading />
      </Modal>
    );
  }
  return (
    <BundleForm
      product={product}
      candidates={candidates.filter((c) => c.id !== product.id)}
      initial={(data?.components ?? []).map((c, key) => ({
        key,
        componentProductId: c.componentProductId,
        quantity: String(c.quantity),
      }))}
      readOnly={readOnly}
      onClose={onClose}
    />
  );
}

interface BundleFormProps extends BundleModalProps {
  initial: Row[];
}

function BundleForm({ product, candidates, initial, readOnly, onClose }: BundleFormProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>(initial);
  const [nextKey, setNextKey] = useState(initial.length);
  const [saving, setSaving] = useState(false);

  const patch = (key: number, p: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const save = async () => {
    setSaving(true);
    try {
      await saveProductBundle(api, product.id, {
        components: rows.map((r) => ({
          componentProductId: r.componentProductId,
          quantity: Number(r.quantity),
        })),
      });
      notify('success', t('common.saved'));
      onClose();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={t('products.bundle.title', { name: product.name })} onClose={onClose} wide>
      <p className="ev-hint">{t('products.bundle.help', { unit: product.unitLabel })}</p>
      {rows.length === 0 && <p className="ev-hint">{t('products.bundle.none')}</p>}
      <div className="ev-receipt-items">
        {rows.map((row) => (
          <fieldset key={row.key} className="ev-receipt-item" disabled={readOnly}>
            <div className="ev-form-grid">
              <SearchSelect
                ariaLabel={t('products.bundle.component')}
                value={row.componentProductId}
                onChange={(v) => patch(row.key, { componentProductId: v })}
                options={candidates.map((p) => ({ value: p.id, label: p.name }))}
              />
              <input
                type="number"
                className="input ev-control"
                aria-label={t('products.bundle.perUnit', { unit: product.unitLabel })}
                min={1}
                step={1}
                required
                value={row.quantity}
                onChange={(e) => patch(row.key, { quantity: e.target.value })}
              />
            </div>
            {!readOnly && (
              <Button
                size="sm"
                variant="ghost"
                icon={mdiDelete}
                onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
              >
                {t('common.remove')}
              </Button>
            )}
          </fieldset>
        ))}
      </div>
      {!readOnly && (
        <div className="modal-action">
          <Button
            variant="secondary"
            icon={mdiPlus}
            disabled={candidates.length === 0}
            onClick={() => {
              setRows((prev) => [
                ...prev,
                { key: nextKey, componentProductId: candidates[0]?.id ?? '', quantity: '1' },
              ]);
              setNextKey((k) => k + 1);
            }}
          >
            {t('products.bundle.add')}
          </Button>
          <Button
            variant="primary"
            icon={mdiContentSave}
            loading={saving}
            disabled={rows.some((r) => !r.componentProductId)}
            onClick={save}
          >
            {t('common.save')}
          </Button>
        </div>
      )}
    </Modal>
  );
}
