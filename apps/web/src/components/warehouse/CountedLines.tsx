import { useState } from 'react';
import { mdiContentSave, mdiPlus } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { countPickList, listProducts } from '@eventra/api-client';
import type { PickLineDto, PickListDto } from '@eventra/shared';
import { api } from '@/api';
import { Button } from '@/components/ui/Button';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { useResource } from '@/hooks/useResource';
import { notify } from '@/lib/notifications';

interface CountedLinesProps {
  pick: PickListDto;
  canWrite: boolean;
  onChanged: () => void;
}

interface RowProps {
  line: PickLineDto;
  pickId: string;
  /** Mode hitung yang sedang berlaku; null = hanya baca. */
  mode: 'OUT' | 'RETURN' | null;
  onChanged: () => void;
}

function CountRow({ line, pickId, mode, onChanged }: RowProps) {
  const { t } = useTranslation();
  const current = mode === 'RETURN' ? line.returned : line.packed;
  const [value, setValue] = useState(current === null ? '' : String(current));
  const lost = line.packed !== null && line.returned !== null ? line.packed - line.returned : null;

  const save = async () => {
    if (!mode || value === '') return;
    try {
      await countPickList(api, pickId, {
        action: mode,
        productId: line.productId,
        quantity: Number(value),
      });
      notify('success', t('warehouse.count.saved'));
      onChanged();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  return (
    <tr className="ev-table__row">
      <td>
        {line.productName}
        {line.extra && (
          <span className="ev-table__hint ev-table__hint--block">
            {t('warehouse.detail.extraBadge')}
          </span>
        )}
      </td>
      <td>{line.required}</td>
      <td>
        {mode === 'OUT' ? (
          <input
            className="input input-sm ev-control ev-count__input"
            inputMode="numeric"
            aria-label={t('warehouse.count.packed')}
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        ) : (
          (line.packed ?? '-')
        )}
      </td>
      <td>
        {mode === 'RETURN' ? (
          <input
            className="input input-sm ev-control ev-count__input"
            inputMode="numeric"
            aria-label={t('warehouse.count.returned')}
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        ) : (
          (line.returned ?? '-')
        )}
      </td>
      <td className="ev-count__lost" data-lost={lost !== null && lost > 0}>
        {lost ?? '-'}
      </td>
      <td className="ev-table__actions">
        {mode && (
          <Button
            size="sm"
            variant="primary"
            icon={mdiContentSave}
            disabled={value === ''}
            onClick={save}
          >
            {t('common.save')}
          </Button>
        )}
      </td>
    </tr>
  );
}

/**
 * Barang stok tidak terbatas (mis. kabel jumper) tidak punya QR per unit; keluar/kembalinya
 * dibuktikan dengan hitung jumlah. Selisih saat kembali dicatat tetapi tidak memblokir pengembalian.
 */
/** Tambah barang stok tidak terbatas di luar pesanan (aksesori include, mis. kabel jumper). */
function AddExtra({
  pickId,
  taken,
  onChanged,
}: {
  pickId: string;
  taken: Set<string>;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const products = useResource(() => listProducts(api, { pageSize: 100 }), 'extra-products');
  const options = (products.data?.items ?? [])
    .filter((p) => p.active && p.stockMode === 'UNLIMITED' && !taken.has(p.id))
    .map((p) => ({ value: p.id, label: p.name }));
  if (options.length === 0) return null;

  const add = async () => {
    try {
      await countPickList(api, pickId, {
        action: 'OUT',
        productId,
        quantity: Number(quantity),
        extra: true,
      });
      notify('success', t('warehouse.count.saved'));
      setProductId('');
      setQuantity('');
      onChanged();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  return (
    <div className="ev-count__add">
      <SearchSelect
        ariaLabel={t('warehouse.count.addExtra')}
        value={productId}
        onChange={setProductId}
        options={[{ value: '', label: t('warehouse.count.addExtra') }, ...options]}
      />
      <input
        className="input input-sm ev-control ev-count__input"
        inputMode="numeric"
        aria-label={t('warehouse.count.packed')}
        value={quantity}
        onChange={(e) => setQuantity(e.target.value.replace(/\D/g, '').slice(0, 6))}
      />
      <Button
        size="sm"
        variant="secondary"
        icon={mdiPlus}
        disabled={!productId || quantity === ''}
        onClick={add}
      >
        {t('common.add')}
      </Button>
    </div>
  );
}

export function CountedLines({ pick, canWrite, onChanged }: CountedLinesProps) {
  const { t } = useTranslation();
  const lines = pick.lines.filter((l) => l.unlimited);

  const preparing = pick.status === 'OPEN' || pick.status === 'VERIFIED';
  const awaitingReturn = pick.status === 'DISPATCHED' || pick.status === 'RETURN_ISSUE';
  const mode = !canWrite ? null : preparing ? 'OUT' : awaitingReturn ? 'RETURN' : null;
  const canAddExtra = canWrite && preparing;
  if (lines.length === 0 && !canAddExtra) return null;

  return (
    <>
      <h2 className="ev-section-title">{t('warehouse.count.title')}</h2>
      <p className="ev-hint">{t('warehouse.count.hint')}</p>
      {canAddExtra && (
        <AddExtra
          pickId={pick.id}
          taken={new Set(pick.lines.map((l) => l.productId))}
          onChanged={onChanged}
        />
      )}
      <div className="ev-table-wrap">
        <table className="table">
          <thead className="ev-table__head">
            <tr>
              <th>{t('warehouse.detail.product')}</th>
              <th>{t('warehouse.detail.required')}</th>
              <th>{t('warehouse.count.packed')}</th>
              <th>{t('warehouse.count.returned')}</th>
              <th>{t('warehouse.count.lost')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <CountRow
                // Hitungan baru dari server mengisi ulang kolom input.
                key={`${line.productId}|${line.packed}|${line.returned}|${mode}`}
                line={line}
                pickId={pick.id}
                mode={mode}
                onChanged={onChanged}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
