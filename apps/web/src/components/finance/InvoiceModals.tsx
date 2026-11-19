import { useState, type FormEvent } from 'react';
import { mdiContentSave } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import {
  createInvoice,
  createPayment,
  listInvoices,
  listOrders,
  remindInvoice,
} from '@eventra/api-client';
import {
  INVOICEABLE_ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_PURPOSES,
  type InvoiceDto,
  type OrderSummaryDto,
  type PaymentMethod,
  type PaymentRequestPurpose,
} from '@eventra/shared';
import { api } from '@/api';
import { Button } from '@/components/ui/Button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { FormField } from '@/components/ui/FormField';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { useResource } from '@/hooks/useResource';
import { formatRupiah } from '@/lib/format';
import { notify } from '@/lib/notifications';

const ORDER_PAGE = 100;
const MAX_ORDER_PAGES = 5;

/** Id pesanan yang sudah punya invoice aktif (bukan VOID). */
async function loadInvoicedOrderIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let page = 1; page <= MAX_ORDER_PAGES; page += 1) {
    const res = await listInvoices(api, { page, pageSize: ORDER_PAGE });
    for (const i of res.items) if (i.status === 'ISSUED') ids.add(i.orderId);
    if (res.items.length < ORDER_PAGE) break;
  }
  return ids;
}

/**
 * Pesanan yang dapat ditagih dan belum punya invoice aktif. Invoice terbit otomatis saat pesanan
 * disetujui, jadi daftar ini hanya berisi pesanan yang gagal/terlewat (cadangan manual).
 */
async function loadInvoiceableOrders(): Promise<OrderSummaryDto[]> {
  const out: OrderSummaryDto[] = [];
  for (let page = 1; page <= MAX_ORDER_PAGES; page += 1) {
    const res = await listOrders(api, { page, pageSize: ORDER_PAGE });
    out.push(...res.items);
    if (res.items.length < ORDER_PAGE) break;
  }
  const invoiced = await loadInvoicedOrderIds();
  return out.filter(
    (o) =>
      (INVOICEABLE_ORDER_STATUSES as readonly string[]).includes(o.status) && !invoiced.has(o.id),
  );
}

interface BaseProps {
  onClose: () => void;
  onChanged: () => void;
}

/** Terbitkan invoice dari pesanan; nominal disalin dari pesanan oleh backend. */
export function InvoiceCreateModal({ onClose, onChanged }: BaseProps) {
  const { t } = useTranslation();
  const orders = useResource(loadInvoiceableOrders, 'invoiceable-orders');
  const [orderId, setOrderId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await createInvoice(api, { orderId, dueDate: dueDate || undefined, note });
      notify('success', t('finance.created'));
      onChanged();
      onClose();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    } finally {
      setSaving(false);
    }
  };

  const options = (orders.data ?? []).map((o) => ({
    value: o.id,
    label: `${o.number} · ${o.customerName} · ${formatRupiah(o.subtotal + o.depositTotal)}`,
  }));

  return (
    <Modal open title={t('finance.newInvoiceTitle')} onClose={onClose}>
      {orders.loading && !orders.data ? (
        <Loading />
      ) : (
        <form className="ev-form" onSubmit={submit}>
          <p className="ev-hint">{t('finance.newInvoiceHint')}</p>
          {options.length === 0 && <p className="ev-hint">{t('finance.noOrders')}</p>}
          <FormField label={t('finance.order')}>
            <SearchSelect
              options={options}
              value={orderId}
              onChange={setOrderId}
              ariaLabel={t('finance.order')}
            />
          </FormField>
          <FormField label={t('finance.dueDate')}>
            <input
              type="date"
              className="input ev-control"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <span className="ev-hint">{t('finance.dueDateHint')}</span>
          </FormField>
          <FormField label={t('finance.note')}>
            <textarea
              className="textarea ev-control"
              maxLength={500}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </FormField>
          <div className="modal-action">
            <Button
              type="submit"
              variant="primary"
              icon={mdiContentSave}
              loading={saving}
              disabled={!orderId}
            >
              {t('finance.issue')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** Catat pembayaran sewa/deposit; nominal diisi otomatis dengan sisa yang boleh dibayar. */
export function PaymentModal({
  invoice,
  defaultAmount,
  onClose,
  onChanged,
}: BaseProps & {
  invoice: Pick<InvoiceDto, 'id' | 'payableRent' | 'payableDeposit'>;
  /** Nominal awal (mis. kekurangan DP) bila berbeda dari sisa tagihan penuh. */
  defaultAmount?: number;
}) {
  const { t } = useTranslation();
  const total = invoice.payableRent + invoice.payableDeposit;
  // "Lunas" hanya relevan bila sewa dan deposit sama-sama masih ada sisa; selain itu satu tujuan saja.
  const canFull = invoice.payableRent > 0 && invoice.payableDeposit > 0;
  const purposes: PaymentRequestPurpose[] = [
    ...(canFull ? (['FULL'] as const) : []),
    ...PAYMENT_PURPOSES.filter(
      (p) => (p === 'RENT' ? invoice.payableRent : invoice.payableDeposit) > 0,
    ),
  ];
  const payableOf = (p: PaymentRequestPurpose) =>
    p === 'FULL' ? total : p === 'RENT' ? invoice.payableRent : invoice.payableDeposit;
  // Dengan nominal awal (DP) pembayaran dimulai sebagai Sewa, bukan Lunas.
  const initialPurpose: PaymentRequestPurpose =
    defaultAmount !== undefined && invoice.payableRent > 0 ? 'RENT' : (purposes[0] ?? 'RENT');
  const [purpose, setPurpose] = useState<PaymentRequestPurpose>(initialPurpose);
  const [method, setMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const payable = payableOf(purpose);
  const [amount, setAmount] = useState(
    String(defaultAmount !== undefined && initialPurpose === 'RENT' ? defaultAmount : payable),
  );
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [paidAt, setPaidAt] = useState('');
  // Batas waktu lokal "sekarang" untuk input datetime-local (pembayaran tidak boleh di masa depan).
  const [maxPaidAt] = useState(() =>
    new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16),
  );
  const [saving, setSaving] = useState(false);

  const changePurpose = (next: PaymentRequestPurpose) => {
    setPurpose(next);
    setAmount(String(payableOf(next)));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await createPayment(api, invoice.id, {
        purpose,
        method,
        amount: purpose === 'FULL' ? undefined : Number(amount),
        reference,
        note,
        paidAt: paidAt ? new Date(paidAt).toISOString() : undefined,
      });
      notify('success', t('finance.paymentRecorded'));
      onChanged();
      onClose();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={t('finance.paymentTitle')} onClose={onClose}>
      <form className="ev-form" onSubmit={submit}>
        <FormField label={t('finance.purpose')}>
          <select
            className="select ev-control"
            value={purpose}
            onChange={(e) => changePurpose(e.target.value as PaymentRequestPurpose)}
          >
            {purposes.map((p) => (
              <option key={p} value={p}>
                {t(`finance.purposes.${p}`)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={t('finance.method')}>
          <select
            className="select ev-control"
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`finance.methods.${m}`)}
              </option>
            ))}
          </select>
          {method === 'GATEWAY' && <span className="ev-hint">{t('finance.gatewayHint')}</span>}
        </FormField>
        <FormField label={t('finance.amount')}>
          <CurrencyInput
            value={amount}
            onChange={setAmount}
            required
            disabled={purpose === 'FULL'}
          />
          <span className="ev-hint">
            {purpose === 'FULL'
              ? t('finance.fullHint', {
                  rent: formatRupiah(invoice.payableRent),
                  deposit: formatRupiah(invoice.payableDeposit),
                })
              : t('finance.maxPayable', { amount: formatRupiah(payable) })}
          </span>
        </FormField>
        <FormField label={t('finance.reference')}>
          <input
            className="input ev-control"
            maxLength={120}
            required={method === 'BANK_TRANSFER' || method === 'GATEWAY'}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <span className="ev-hint">{t('finance.referenceHint')}</span>
        </FormField>
        <FormField label={t('finance.paidAt')}>
          <input
            type="datetime-local"
            className="input ev-control"
            value={paidAt}
            max={maxPaidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
        </FormField>
        <FormField label={t('finance.note')}>
          <input
            className="input ev-control"
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>
        <div className="modal-action">
          <Button
            type="submit"
            variant="primary"
            icon={mdiContentSave}
            loading={saving}
            disabled={payable <= 0 || Number(amount) <= 0}
          >
            {t('finance.recordPayment')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Pengingat manual dengan catatan opsional. */
export function ReminderModal({
  invoice,
  onClose,
  onChanged,
}: BaseProps & { invoice: InvoiceDto }) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await remindInvoice(api, invoice.id, { note });
      notify('success', t('finance.reminded'));
      onChanged();
      onClose();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={t('finance.remind')} onClose={onClose}>
      <form className="ev-form" onSubmit={submit}>
        <p className="ev-hint">{t('finance.reminderHint')}</p>
        <FormField label={t('finance.reminderNote')}>
          <textarea
            className="textarea ev-control"
            maxLength={300}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>
        <div className="modal-action">
          <Button type="submit" variant="primary" loading={saving}>
            {t('finance.remind')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
