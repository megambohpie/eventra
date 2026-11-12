import { useState, type FormEvent } from 'react';
import { mdiCalendarCheck, mdiContentSave, mdiDelete, mdiPlus } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { checkAvailability, createOrder, updateOrder } from '@eventra/api-client';
import type { AvailabilityResultDto, CustomerDto, OrderDto, ProductDto } from '@eventra/shared';
import { api } from '@/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { notify } from '@/lib/notifications';

interface ItemDraft {
  key: number;
  productId: string;
  quantity: string;
}

interface OrderModalProps {
  /** Draft yang diubah; kosong = pesanan baru. */
  order?: OrderDto;
  customers: CustomerDto[];
  products: ProductDto[];
  onClose: () => void;
  /** Dipanggil dengan id pesanan setelah tersimpan. */
  onSaved: (orderId: string) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function OrderModal({ order, customers, products, onClose, onSaved }: OrderModalProps) {
  const { t } = useTranslation();
  const [customerId, setCustomerId] = useState(order?.customerId ?? '');
  const [startDate, setStartDate] = useState(order?.startDate ?? today());
  const [endDate, setEndDate] = useState(order?.endDate ?? today());
  const [eventLocation, setEventLocation] = useState(order?.eventLocation ?? '');
  const [note, setNote] = useState(order?.note ?? '');
  const [nextKey, setNextKey] = useState(order?.items.length ?? 1);
  const [items, setItems] = useState<ItemDraft[]>(
    order
      ? order.items.map((i, key) => ({ key, productId: i.productId, quantity: String(i.quantity) }))
      : [{ key: 0, productId: products[0]?.id ?? '', quantity: '1' }],
  );
  const [saving, setSaving] = useState(false);
  const [availability, setAvailability] = useState<AvailabilityResultDto | null>(null);

  const patchItem = (key: number, patch: Partial<ItemDraft>) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
    setAvailability(null);
  };

  const payload = () => ({
    customerId,
    startDate,
    endDate,
    eventLocation,
    note,
    items: items.map((i) => ({ productId: i.productId, quantity: Number(i.quantity) })),
  });

  const check = async () => {
    try {
      setAvailability(
        await checkAvailability(api, {
          startDate,
          endDate,
          items: payload().items,
          excludeOrderId: order?.id,
        }),
      );
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = order
        ? await updateOrder(api, order.id, payload())
        : await createOrder(api, payload());
      notify('success', t('common.saved'));
      onSaved(saved.id);
      onClose();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    } finally {
      setSaving(false);
    }
  };

  const resultFor = (productId: string) =>
    availability?.items.find((i) => i.productId === productId);

  return (
    <Modal
      open
      title={order ? `${t('orders.edit')} ${order.number}` : t('orders.new')}
      onClose={onClose}
      wide
    >
      <form onSubmit={submit}>
        <fieldset className="ev-form-grid">
          <FormField label={t('orders.customer')}>
            <SearchSelect
              ariaLabel={t('orders.customer')}
              value={customerId}
              onChange={setCustomerId}
              options={customers.map((c) => ({ value: c.id, label: c.name }))}
            />
          </FormField>
          <FormField label={t('orders.eventLocation')}>
            <input
              className="input ev-control"
              required
              value={eventLocation}
              onChange={(e) => setEventLocation(e.target.value)}
            />
          </FormField>
          <FormField label={t('orders.startDate')}>
            <input
              type="date"
              className="input ev-control"
              required
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (endDate < e.target.value) setEndDate(e.target.value);
                setAvailability(null);
              }}
            />
          </FormField>
          <FormField label={t('orders.endDate')}>
            <input
              type="date"
              className="input ev-control"
              required
              min={startDate}
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setAvailability(null);
              }}
            />
          </FormField>
          <div className="ev-form-grid__full">
            <FormField label={t('common.note')}>
              <textarea
                className="textarea ev-control"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </FormField>
          </div>
        </fieldset>

        <h3 className="ev-section-title">{t('orders.items')}</h3>
        <div className="ev-receipt-items">
          {items.map((item) => {
            const result = resultFor(item.productId);
            return (
              <fieldset key={item.key} className="ev-receipt-item">
                <div className="ev-form-grid">
                  <FormField label={t('orders.product')}>
                    <SearchSelect
                      ariaLabel={t('orders.product')}
                      value={item.productId}
                      onChange={(value) => patchItem(item.key, { productId: value })}
                      options={products.map((p) => ({ value: p.id, label: p.name }))}
                    />
                  </FormField>
                  <FormField label={t('orders.quantity')}>
                    <input
                      type="number"
                      className="input ev-control"
                      min={1}
                      step={1}
                      required
                      value={item.quantity}
                      onChange={(e) => patchItem(item.key, { quantity: e.target.value })}
                    />
                  </FormField>
                </div>
                {result && (
                  <div className="ev-availability">
                    <Badge variant={result.available ? 'success' : 'error'}>
                      {result.available ? t('orders.available') : t('orders.notAvailable')}
                    </Badge>
                    <span>{t('orders.maxQuantity', { count: result.maxQuantity })}</span>
                  </div>
                )}
                {items.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={mdiDelete}
                    onClick={() => {
                      setItems((prev) => prev.filter((i) => i.key !== item.key));
                      setAvailability(null);
                    }}
                  >
                    {t('orders.removeItem')}
                  </Button>
                )}
              </fieldset>
            );
          })}
        </div>
        <div className="ev-filters">
          <Button
            size="sm"
            variant="secondary"
            icon={mdiPlus}
            onClick={() => {
              setItems((prev) => [
                ...prev,
                { key: nextKey, productId: products[0]?.id ?? '', quantity: '1' },
              ]);
              setNextKey((k) => k + 1);
            }}
          >
            {t('orders.addItem')}
          </Button>
          <Button size="sm" variant="ghost" icon={mdiCalendarCheck} onClick={check}>
            {t('orders.checkAvailability')}
          </Button>
        </div>

        <div className="modal-action">
          <Button
            type="submit"
            variant="primary"
            icon={mdiContentSave}
            loading={saving}
            disabled={!customerId || items.some((i) => !i.productId)}
          >
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
