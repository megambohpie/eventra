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
import {
  DEPOSIT_ENABLED,
  MAX_ITEM_QUANTITY,
  rentalDays,
  STOCK_MODES,
  type LatLng,
  type OrderDto,
  type ProductDto,
  type StockMode,
} from '@eventra/shared';
import { api } from '@/api';
import { CustomerModal } from '@/components/customers/CustomerModal';
import { ProductThumb } from '@/components/products/ProductThumb';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { FormField } from '@/components/ui/FormField';
import { LocationPicker } from '@/components/ui/LocationPicker';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { SearchInput } from '@/components/ui/SearchInput';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { useResource } from '@/hooks/useResource';
import { formatRupiah } from '@/lib/format';
import { notify } from '@/lib/notifications';
import { cartTotals, clampQty, priceDiffPercent, setCartQty, type Cart } from '@/lib/pos';
import { physicalUsed, stockEntry, unitsLeft, type StockMap } from '@/lib/stock';

const CHUNK = 50;
const todayKey = () => new Date().toISOString().slice(0, 10);

/**
 * Stok live untuk semua produk pada tanggal sewa: sisa fisik tiap komponen. Sisa yang tampil di kartu
 * dihitung ulang dari isi keranjang (`unitsLeft`), sehingga menambah jumlah mengurangi stok dan
 * menguranginya mengembalikan stok, termasuk stok yang dipakai bersama paket.
 */
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
      independent: true,
    });
    for (const item of result.items) stock[item.productId] = stockEntry(item);
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
  const [eventAddress, setEventAddress] = useState(order?.eventAddress ?? '');
  const [point, setPoint] = useState<LatLng | null>(
    order?.eventLat != null && order.eventLng != null
      ? { lat: order.eventLat, lng: order.eventLng }
      : null,
  );
  const [note, setNote] = useState(order?.note ?? '');
  const [cart, setCart] = useState<Cart>(
    Object.fromEntries((order?.items ?? []).map((i) => [i.productId, i.quantity])),
  );
  // Harga final per produk hasil negosiasi (digit; kosong/tidak ada = harga default produk).
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    order?.pricingMode === 'LINE'
      ? Object.fromEntries(
          order.items
            .filter((i) => i.unitPrice !== i.listPrice)
            .map((i) => [i.productId, String(i.unitPrice)]),
        )
      : {},
  );
  const [lump, setLump] = useState(order?.pricingMode === 'LUMP');
  const [lumpTotal, setLumpTotal] = useState(
    order?.lumpTotal != null ? String(order.lumpTotal) : '',
  );
  const [depositCustom, setDepositCustom] = useState(order?.depositOverride != null);
  const [depositValue, setDepositValue] = useState(
    order?.depositOverride != null ? String(order.depositOverride) : '',
  );
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [stockFilter, setStockFilter] = useState<StockMode | ''>('');
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
    // Produk tanpa kategori tidak punya filter kategori sendiri; tetap tampil di "semua kategori".
    for (const p of products)
      if (p.categoryId && p.category) map.set(p.categoryId, p.category.name);
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [products]);

  const visible = products.filter(
    (p) =>
      (!categoryId || p.categoryId === categoryId) &&
      (!stockFilter || p.stockMode === stockFilter) &&
      (!q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())),
  );
  // Kelompokkan per jenis stok (urutan tetap) agar ketiganya mudah dibedakan.
  const groups = STOCK_MODES.map((mode) => ({
    mode,
    items: visible.filter((p) => p.stockMode === mode),
  })).filter((g) => g.items.length > 0);

  const priceNums: Record<string, number> = Object.fromEntries(
    Object.entries(prices)
      .filter(([, v]) => v !== '')
      .map(([id, v]) => [id, Number(v)]),
  );
  const totals = cartTotals(products, cart, startDate, endDate, {
    prices: priceNums,
    lumpTotal: lump ? Number(lumpTotal || 0) : null,
    depositOverride: depositCustom ? Number(depositValue || 0) : null,
  });
  const totalDiff =
    totals.subtotal === totals.listSubtotal
      ? null
      : priceDiffPercent(totals.subtotal, totals.listSubtotal);
  const cartLines = products.filter((p) => (cart[p.id] ?? 0) > 0);
  // Sisa stok per produk setelah isi keranjang (negatif = keranjang melebihi stok bersama).
  const used = stock ? physicalUsed(stock, cart) : undefined;
  const leftOf = (productId: string): number | undefined => {
    const entry = stock?.[productId];
    return entry && used ? unitsLeft(entry, used) : undefined;
  };
  const overStock = cartLines.some((p) => (leftOf(p.id) ?? 0) < 0);

  const setQty = (productId: string, raw: string | number) =>
    setCart((prev) => {
      const entry = stock?.[productId];
      // Batas kuantitas = jumlah sekarang + sisa; dihitung dari keranjang sebelumnya agar tak basi.
      const cap = entry
        ? (prev[productId] ?? 0) + unitsLeft(entry, physicalUsed(stock, prev))
        : undefined;
      return setCartQty(prev, productId, clampQty(raw, cap));
    });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        customerId,
        startDate,
        endDate,
        eventLocation,
        eventAddress,
        eventLat: point?.lat ?? null,
        eventLng: point?.lng ?? null,
        note,
        pricingMode: lump ? ('LUMP' as const) : ('LINE' as const),
        lumpTotal: lump ? Number(lumpTotal || 0) : null,
        depositOverride: depositCustom ? Number(depositValue || 0) : null,
        items: cartLines.map((p) => ({
          productId: p.id,
          quantity: cart[p.id] ?? 0,
          unitPrice: !lump && priceNums[p.id] !== undefined ? priceNums[p.id] : null,
        })),
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
    (!lump || lumpTotal !== '') &&
    (!depositCustom || depositValue !== '') &&
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
        {validDates ? (
          <p className="ev-pos__duration">
            {t('orders.pos.duration')}: <strong>{t('orders.days', { count: totals.days })}</strong>
          </p>
        ) : (
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
          <SearchSelect
            ariaLabel={t('products.stockModeLabel')}
            value={stockFilter}
            onChange={(v) => setStockFilter(v as StockMode | '')}
            options={[
              { value: '', label: t('orders.pos.allStockModes') },
              ...STOCK_MODES.map((m) => ({ value: m, label: t(`products.stockModes.${m}`) })),
            ]}
          />
        </div>

        <div className="ev-pos__groups">
          {groups.map((group) => (
            <section key={group.mode} className="ev-pos__group" data-mode={group.mode}>
              {stockFilter === '' && (
                <h3 className="ev-pos__group-title">
                  <span>{t(`products.stockModes.${group.mode}`)}</span>
                  <span className="ev-pos__group-count">{group.items.length}</span>
                </h3>
              )}
              <div className="ev-pos__grid">
                {group.items.map((p) => {
                  const qty = cart[p.id] ?? 0;
                  // Sisa yang masih bisa ditambahkan; turun saat jumlah bertambah, naik saat berkurang.
                  const left = leftOf(p.id);
                  const soldOut = left !== undefined && left <= 0 && qty === 0;
                  return (
                    <div
                      key={p.id}
                      className="ev-pos__card"
                      data-selected={qty > 0}
                      data-soldout={soldOut}
                      data-mode={p.stockMode}
                    >
                      <button
                        type="button"
                        className="ev-pos__pick"
                        disabled={left !== undefined && left <= 0}
                        onClick={() => setQty(p.id, qty + 1)}
                      >
                        <span className="ev-pos__thumb">
                          <ProductThumb productId={p.id} hasPhoto={p.hasPhoto} />
                        </span>
                        <span className="ev-pos__name">{p.name}</span>
                        <span className="ev-pos__price">
                          {p.unitPrice === 0
                            ? t('orders.pos.included')
                            : `${formatRupiah(p.unitPrice)} / ${p.unitLabel}`}
                          {p.pricingUnit === 'AREA' && (
                            <span className="ev-table__hint ev-table__hint--block">
                              {t('orders.pos.perArea', { price: formatRupiah(p.price) })}
                            </span>
                          )}
                        </span>
                        <span className="ev-pos__stock">
                          {left === undefined ? (
                            <span className="ev-dots" />
                          ) : (
                            <Badge variant={soldOut ? 'error' : left <= 0 ? 'warning' : 'success'}>
                              {soldOut
                                ? t('orders.pos.soldOut')
                                : p.stockMode === 'UNLIMITED' || left >= MAX_ITEM_QUANTITY
                                  ? t('orders.pos.unlimited')
                                  : t('orders.pos.stock', { count: Math.max(0, left) })}
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
                            disabled={left !== undefined && left <= 0}
                            onClick={() => setQty(p.id, qty + 1)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          {visible.length === 0 && <p className="ev-hint">{t('common.empty')}</p>}
        </div>
      </PageCard>

      <aside className="card ev-card ev-pos__cart">
        <header className="ev-pos__cart-head">
          <h2 id="pos-cart" className="ev-section-title">
            {t('orders.pos.cart')}
          </h2>
          <span className="badge badge-primary badge-soft">
            {t('orders.pos.units', { count: totals.units })}
          </span>
        </header>
        <div className="ev-pos__cart-body">
          <div className="ev-pos__customer">
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
          </div>
          {cartLines.length === 0 ? (
            <p className="ev-hint">{t('orders.pos.cartEmpty')}</p>
          ) : (
            <ul className="ev-pos__lines">
              {cartLines.map((p) => {
                const price = priceNums[p.id] ?? p.unitPrice;
                const diff = price === p.unitPrice ? null : priceDiffPercent(price, p.unitPrice);
                return (
                  <li key={p.id} className="ev-pos__line">
                    <div className="ev-pos__line-head">
                      <span>
                        {p.name} × {cart[p.id]}
                      </span>
                      {!lump && (
                        <span>{formatRupiah(price * (cart[p.id] ?? 0) * totals.days)}</span>
                      )}
                    </div>
                    {!lump && (
                      <p className="ev-hint">
                        {t('orders.pos.lineFormula', {
                          price: formatRupiah(price),
                          qty: cart[p.id] ?? 0,
                          days: t('orders.days', { count: totals.days }),
                        })}
                      </p>
                    )}
                    {!lump && (
                      <div className="ev-pos__line-price">
                        <CurrencyInput
                          ariaLabel={t('orders.pricing.linePrice', { name: p.name })}
                          value={prices[p.id] ?? String(p.unitPrice)}
                          onChange={(digits) => setPrices((prev) => ({ ...prev, [p.id]: digits }))}
                        />
                        <span className="ev-hint">
                          {t('orders.pricing.default', { price: formatRupiah(p.unitPrice) })}
                          {diff !== null && (
                            <span className="ev-pos__diff" data-tone={diff < 0 ? 'down' : 'up'}>
                              {' '}
                              {diff > 0 ? '+' : ''}
                              {diff}%
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <fieldset className="ev-pos__pricing">
            <label className="label ev-pos__lump-toggle">
              <input
                type="checkbox"
                className="toggle toggle-primary"
                checked={lump}
                onChange={(e) => setLump(e.target.checked)}
              />
              <span>{t('orders.pricing.lump')}</span>
            </label>
            {lump && (
              <>
                <FormField label={t('orders.pricing.lumpTotal')}>
                  <CurrencyInput
                    required
                    ariaLabel={t('orders.pricing.lumpTotal')}
                    value={lumpTotal}
                    onChange={setLumpTotal}
                  />
                </FormField>
                <p className="ev-hint">{t('orders.pricing.lumpHint')}</p>
              </>
            )}
            {DEPOSIT_ENABLED && (
              <label className="label ev-pos__lump-toggle">
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={depositCustom}
                  onChange={(e) => {
                    setDepositCustom(e.target.checked);
                    // Mulai dari deposit default agar tinggal disesuaikan.
                    if (e.target.checked && depositValue === '')
                      setDepositValue(String(totals.listDeposit));
                  }}
                />
                <span>{t('orders.pricing.depositCustom')}</span>
              </label>
            )}
            {DEPOSIT_ENABLED && depositCustom && (
              <>
                <FormField label={t('orders.pricing.depositTotal')}>
                  <CurrencyInput
                    required
                    ariaLabel={t('orders.pricing.depositTotal')}
                    value={depositValue}
                    onChange={setDepositValue}
                  />
                </FormField>
                <p className="ev-hint">
                  {t('orders.pricing.depositDefault', { total: formatRupiah(totals.listDeposit) })}
                </p>
              </>
            )}
            {totals.listSubtotal > 0 && (
              <p className="ev-hint">
                {t('orders.pricing.listTotal', { total: formatRupiah(totals.listSubtotal) })}
                {totalDiff !== null && (
                  <span className="ev-pos__diff" data-tone={totalDiff < 0 ? 'down' : 'up'}>
                    {' '}
                    ({totalDiff > 0 ? '+' : ''}
                    {totalDiff}%)
                  </span>
                )}
              </p>
            )}
          </fieldset>
          <details className="collapse collapse-arrow ev-pos__section" open>
            <summary className="collapse-title ev-pos__section-title">
              {t('orders.pos.eventDetails')}
            </summary>
            <div className="collapse-content ev-pos__section-body">
              <FormField label={t('orders.eventLocation')}>
                <input
                  className="input ev-control"
                  required
                  value={eventLocation}
                  onChange={(e) => setEventLocation(e.target.value)}
                />
              </FormField>
              <FormField label={t('orders.eventAddress')}>
                <textarea
                  className="textarea ev-control"
                  rows={2}
                  placeholder={t('orders.eventAddressPlaceholder')}
                  value={eventAddress}
                  onChange={(e) => setEventAddress(e.target.value)}
                />
              </FormField>
              <LocationPicker value={point} onChange={setPoint} />
              <FormField label={t('common.note')}>
                <textarea
                  className="textarea ev-control"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </FormField>
            </div>
          </details>
        </div>
        <footer className="ev-pos__cart-foot">
          <dl className="ev-pos__totals">
            <dt>{t('orders.pos.duration')}</dt>
            <dd>{t('orders.days', { count: totals.days })}</dd>
            <dt>{t('orders.pos.totalUnits')}</dt>
            <dd>{t('orders.pos.units', { count: totals.units })}</dd>
            {totals.areaM2 > 0 && (
              <>
                <dt>{t('orders.pos.totalArea')}</dt>
                <dd>{totals.areaM2} m²</dd>
              </>
            )}
            <dt>{t('orders.subtotal')}</dt>
            <dd>{formatRupiah(totals.subtotal)}</dd>
            {DEPOSIT_ENABLED && (
              <>
                <dt>{t('orders.deposit')}</dt>
                <dd>{formatRupiah(totals.deposit)}</dd>
              </>
            )}
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
        </footer>
      </aside>

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
  // Kabinet anggota kelompok "per meter" tidak dipesan per buah; gudang memilihnya saat menyiapkan.
  const activeProducts = (products.data?.items ?? []).filter((p) => p.active && !p.areaPoolId);
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
