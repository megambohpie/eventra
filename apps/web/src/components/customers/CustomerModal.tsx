import { useState, type FormEvent } from 'react';
import { mdiContentSave } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { createCustomer, updateCustomer } from '@eventra/api-client';
import { CUSTOMER_TYPES, type CustomerDto, type CustomerType } from '@eventra/shared';
import { api } from '@/api';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { notify } from '@/lib/notifications';

interface CustomerModalProps {
  /** Kosong berarti membuat pelanggan baru. */
  customer?: CustomerDto;
  readOnly: boolean;
  onClose: () => void;
  /** Dipanggil setelah data berubah agar daftar dimuat ulang. */
  onChanged: () => void;
}

/** Data pelanggan saja; PIC ditunjuk per pesanan, bukan disimpan di pelanggan. */
export function CustomerModal({ customer, readOnly, onClose, onChanged }: CustomerModalProps) {
  const { t } = useTranslation();
  const [type, setType] = useState<CustomerType>(customer?.type ?? 'INDIVIDUAL');
  const [name, setName] = useState(customer?.name ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [address, setAddress] = useState(customer?.address ?? '');
  const [note, setNote] = useState(customer?.verificationNote ?? '');
  const [active, setActive] = useState(customer?.active ?? true);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const input = {
        type,
        name,
        email: email || undefined,
        phone: phone || undefined,
        address: address || undefined,
        verificationNote: note || undefined,
      };
      if (customer) await updateCustomer(api, customer.id, { ...input, active });
      else await createCustomer(api, input);
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
    <Modal open title={customer ? customer.name : t('customers.new')} onClose={onClose} wide>
      <form onSubmit={submit}>
        <fieldset disabled={readOnly} className="ev-form-grid">
          <FormField label={t('customers.type')}>
            <select
              className="select ev-control"
              value={type}
              onChange={(e) => setType(e.target.value as CustomerType)}
            >
              {CUSTOMER_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(`customers.types.${value}`)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t('customers.name')}>
            <input
              className="input ev-control"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
          <FormField label={t('customers.email')}>
            <input
              type="email"
              className="input ev-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>
          <FormField label={t('customers.phone')}>
            <input
              className="input ev-control"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </FormField>
          <div className="ev-form-grid__full">
            <FormField label={t('customers.address')}>
              <textarea
                className="textarea ev-control"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </FormField>
          </div>
          <div className="ev-form-grid__full">
            <FormField label={t('customers.verificationNote')}>
              <input
                className="input ev-control"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </FormField>
          </div>
          {customer && (
            <label className="label ev-toggle-row ev-form-grid__full">
              <input
                type="checkbox"
                className="toggle toggle-primary"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              {t('common.active')}
            </label>
          )}
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
