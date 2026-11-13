import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { mdiAccountPlus, mdiCheck, mdiMinus, mdiPlus } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  checkAvailability,
  createOrder,
  getOrder,
  listCustomers,
  listProducts,
  updateOrder,
} from '@eventra/api-client';
import { rentalDays, type OrderDto, type ProductDto } from '@eventra/shared';
import { api } from '@/api';
import { CustomerModal } from '@/components/customers/CustomerModal';
import { ProductThumb } from '@/components/products/ProductThumb';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { SearchInput } from '@/components/ui/SearchInput';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { useResource } from '@/hooks/useResource';
import { formatRupiah } from '@/lib/format';
import { notify } from '@/lib/notifications';
import { cartTotals, clampQty, setCartQty, type Cart } from '@/lib/pos';

const CHUNK = 50;
const todayKey = () => new Date().toISOString().slice(0, 10);

type StockMap = Record<string, number>;

/** Stok live (kuantitas satuan sewa maksimum pada seluruh tanggal) untuk semua produk. */
async function loadStock(
  products: ProductDto[],
  startDate: string,
  endDate: string,
  excludeOrderId?: string,
): Promise<StockMap> {
  const stock: StockMap = {};
  for (let i = 0; i < products.length; i += CHUNK) {
    const result = await checkAvailability(api, {
      startDate,
      endDate,
      items: products.slice(i, i + CHUNK).map((p) => ({ productId: p.id, quantity: 1 })),
      excludeOrderId,
    });
    for (const item of result.items) stock[item.productId] = item.maxQuantity;
  }
  return stock;
}

interface PosFormProps {
  order?: OrderDto;
  initialStart: string;
  products: ProductDto[];
  reloadCustomers: () => void;
  customers: { id: string; name: string }[];
}

function PosForm({ order, initialStart, products, customers, reloadCustomers }: PosFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [customerId, setCustomerId] = useState(order?.customerId ?? '');
  const [startDate, setStartDate] = useState(order?.startDate ?? initialStart);
  const [endDate, setEndDate] = useState(order?.endDate ?? initialStart);
  const [eventLocation, setEventLocation] = useState(order?.eventLocation ?? '');
  const [note, setNote] = useState(order?.note ?? '');
  const [cart, setCart] = useState<Cart>(
    Object.fromEntries((order?.items ?? []).map((i) => [i.productId, i.quantity])),
  );
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [newCustomer, setNewCustomer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stockState, setStockState] = useState<{ key: string; stock: StockMap } | null>(null);

  const validDates = rentalDays(startDate, endDate) >= 1;
  const stockKey = `${startDate}|${endDate}|${products.length}`;
  const stock = stockState?.key === stockKey ? stockState.stock : undefined;

  // Stok dihitung ulang (ditunda) tiap tanggal berubah.
  useEffect(() => {
    if (!validDates) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      loadStock(products, startDate, endDate, order?.id).then(
        (map) => {
          if (!cancelled) setStockState({ key: stockKey, stock: map });
        },
        () => undefined, // error sudah tampil sebagai notifikasi
      );
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [products, startDate, endDate, validDates, order?.id, stockKey]);

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) map.set(p.categoryId, p.category.name);
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [products]);

  const visible = products.filter(
    (p) =>
      (!categoryId || p.categoryId === categoryId) &&
      (!q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())),
  );

  const totals = cartTotals(products, cart, startDate, endDate);
  const cartLines = products.filter((p) => (cart[p.id] ?? 0) > 0);
  const overStock = stock ? cartLines.some((p) => (cart[p.id] ?? 0) > (stock[p.id] ?? 0)) : false;

  const setQty = (productId: string, raw: string | number) =>
    setCart((prev) => setCartQty(prev, productId, clampQty(raw, stock?.[productId])));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        customerId,
        startDate,
        endDate,
        eventLocation,
        note,
        items: cartLines.map((p) => ({ productId: p.id, quantity: cart[p.id] ?? 0 })),
      };
      const saved = order
        ? await updateOrder(api, order.id, payload)
        : await createOrder(api, payload);
      notify('success', t('common.saved'));
      navigate(`/orders/${saved.id}`);
    } catch {
      /* error sudah tampil sebagai notifikasi */
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    Boolean(customerId) &&
    eventLocation.trim().length > 0 &&
    validDates &&
    cartLines.length > 0 &&
    !overStock;

  return (
    <form className="ev-pos" onSubmit={submit}>
      <PageCard className="ev-pos__main">
        <PageHeader
          title={order ? `${t('orders.edit')} ${order.number}` : t('orders.new')}
          subtitle={t('orders.pos.subtitle')}
        >
          <Link className="btn btn-ghost btn-sm" to={order ? `/orders/${order.id}` : '/orders'}>
            {t('common.cancel')}
          </Link>
        </PageHeader>

        <fieldset className="ev-form-grid">
          <FormField label={t('orders.startDate')}>
            <input
              type="date"
              className="input ev-control"
              required
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (endDate < e.target.value) setEndDate(e.target.value);
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
              onChange={(e) => setEndDate(e.target.value)}
            />
          </FormField>
        </fieldset>
        {!validDates && (
          <div role="alert" className="alert alert-warning ev-notice">
            <span>{t('orders.pos.invalidDates')}</span>
          </div>
        )}

        <div className="ev-pos__toolbar">
          <SearchInput value={q} onChange={setQ} />
          <SearchSelect
            ariaLabel={t('orders.pos.category')}
            value={categoryId}
            onChange={setCategoryId}
            options={[{ value: '', label: t('orders.pos.allCategories') }, ...categories]}
          />
        </div>

        <div className="ev-pos__grid">
          {visible.map((p) => {
            const qty = cart[p.id] ?? 0;
            const max = stock?.[p.id];
            const soldOut = max !== undefined && max <= 0;
            return (
              <div
                key={p.id}
                className="ev-pos__card"
                data-selected={qty > 0}
                data-soldout={soldOut}
              >
                <button
                  type="button"
                  className="ev-pos__pick"
                  disabled={soldOut || (max !== undefined && qty >= max)}
                  onClick={() => setQty(p.id, qty + 1)}
                >
                  <span className="ev-pos__thumb">
                    <ProductThumb productId={p.id} hasPhoto={p.hasPhoto} />
                  </span>
                  <span className="ev-pos__name">{p.name}</span>
                  <span className="ev-pos__price">
                    {formatRupiah(p.price)} / {p.unitLabel}
                  </span>
                  <span className="ev-pos__stock">
                    {max === undefined ? (
                      <span className="ev-dots" />
                    ) : (
                      <Badge variant={soldOut ? 'error' : 'success'}>
                        {soldOut ? t('orders.pos.soldOut') : t('orders.pos.stock', { count: max })}
                      </Badge>
                    )}
                  </span>
                </button>
                {qty > 0 && (
                  <div className="ev-pos__qty">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={mdiMinus}
                      aria-label={t('orders.pos.decrease')}
                      onClick={() => setQty(p.id, qty - 1)}
                    />
                    <input
                      className="input input-sm ev-control ev-pos__qty-input"
                      inputMode="numeric"
                      aria-label={t('orders.quantity')}
                      value={qty}
                      onChange={(e) => setQty(p.id, e.target.value)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={mdiPlus}
                      aria-label={t('orders.pos.increase')}
                      disabled={max !== undefined && qty >= max}
                      onClick={() => setQty(p.id, qty + 1)}
                    />
                  </div>
                )}
              </div>
            );
          })}
          {visible.length === 0 && <p className="ev-hint">{t('common.empty')}</p>}
        </div>
      </PageCard>

      <PageCard className="ev-pos__cart">
        <h2 id="pos-cart" className="ev-section-title">
          {t('orders.pos.cart')}
        </h2>
        <FormField label={t('orders.customer')}>
          <SearchSelect
            ariaLabel={t('orders.customer')}
            value={customerId}
            onChange={setCustomerId}
            options={customers.map((c) => ({ value: c.id, label: c.name }))}
          />
        </FormField>
        <Button
          size="sm"
          variant="ghost"
          icon={mdiAccountPlus}
          onClick={() => setNewCustomer(true)}
        >
          {t('orders.pos.newCustomer')}
        </Button>
        <FormField label={t('orders.eventLocation')}>
          <input
            className="input ev-control"
            required
            value={eventLocation}
            onChange={(e) => setEventLocation(e.target.value)}
          />
        </FormField>
        <FormField label={t('common.note')}>
          <textarea
            className="textarea ev-control"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>

        {cartLines.length === 0 ? (
          <p className="ev-hint">{t('orders.pos.cartEmpty')}</p>
        ) : (
          <ul className="ev-pos__lines">
            {cartLines.map((p) => (
              <li key={p.id} className="ev-pos__line">
                <span>
                  {p.name} × {cart[p.id]}
                </span>
                <span>{formatRupiah(p.price * (cart[p.id] ?? 0) * totals.days)}</span>
              </li>
            ))}
          </ul>
        )}
        <dl className="ev-pos__totals">
          <dt>{t('orders.days', { count: totals.days })}</dt>
          <dd>{t('orders.pos.units', { count: totals.units })}</dd>
          <dt>{t('orders.subtotal')}</dt>
          <dd>{formatRupiah(totals.subtotal)}</dd>
          <dt>{t('orders.deposit')}</dt>
          <dd>{formatRupiah(totals.deposit)}</dd>
        </dl>
        <p className="ev-hint">{t('orders.pos.estimateHint')}</p>
        <Button
          type="submit"
          variant="primary"
          icon={mdiCheck}
          loading={saving}
          disabled={!canSave}
        >
          {t('common.save')}
        </Button>
      </PageCard>

      <a href="#pos-cart" className="ev-pos__bar">
        <span>{t('orders.pos.units', { count: totals.units })}</span>
        <strong>{formatRupiah(totals.subtotal)}</strong>
      </a>

      {newCustomer && (
        <CustomerModal
          readOnly={false}
          onClose={() => setNewCustomer(false)}
          onChanged={reloadCustomers}
        />
      )}
    </form>
  );
}

/** Pesanan sebagai POS: pilih produk lewat kartu, stok live per tanggal sewa. */
export function OrderPosPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [params] = useSearchParams();
  const editing = Boolean(id);

  const order = useResource(
    () => (id ? getOrder(api, id) : Promise.resolve(undefined)),
    `pos-order|${id ?? ''}`,
  );
  const customers = useResource(() => listCustomers(api, { pageSize: 100 }), 'pos-customers');
  const products = useResource(() => listProducts(api, { pageSize: 100 }), 'pos-products');

  if ((editing && order.loading) || customers.loading || products.loading) return <Loading />;
  const activeProducts = (products.data?.items ?? []).filter((p) => p.active);
  const orderData = order.data;
  if (editing && !orderData) return <Loading />;

  if (orderData && orderData.status !== 'DRAFT') {
    return (
      <PageCard>
        <div role="alert" className="alert alert-warning ev-notice">
          <span>{t('orders.pos.notDraft')}</span>
        </div>
        <Link className="btn btn-ghost btn-sm" to={`/orders/${orderData.id}`}>
          {t('common.back')}
        </Link>
      </PageCard>
    );
  }

  const start = params.get('start');
  const initialStart = start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : todayKey();

  return (
    <PosForm
      key={orderData?.id ?? 'new'}
      order={orderData}
      initialStart={initialStart}
      products={activeProducts}
      customers={(customers.data?.items ?? []).filter(
        (c) => c.active || c.id === orderData?.customerId,
      )}
      reloadCustomers={customers.reload}
    />
  );
}
