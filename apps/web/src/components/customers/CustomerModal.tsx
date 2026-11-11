import { useState, type FormEvent } from 'react';
import { mdiContentSave, mdiPlus } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import {
  addCustomerContact,
  createCustomer,
  updateCustomer,
  updateCustomerContact,
} from '@eventra/api-client';
import {
  CUSTOMER_TYPES,
  type CustomerContactDto,
  type CustomerContactInput,
  type CustomerDto,
  type CustomerType,
} from '@eventra/shared';
import { api } from '@/api';
import { Badge } from '@/components/ui/Badge';
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

const emptyContact = (): CustomerContactInput => ({ name: '', phone: '', position: undefined });

function ContactFields({
  value,
  onChange,
  disabled,
}: {
  value: CustomerContactInput;
  onChange: (next: CustomerContactInput) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <input
        className="input w-full"
        placeholder={t('customers.contactName')}
        aria-label={t('customers.contactName')}
        required
        disabled={disabled}
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
      />
      <input
        className="input w-full"
        placeholder={t('customers.contactPhone')}
        aria-label={t('customers.contactPhone')}
        required
        minLength={3}
        disabled={disabled}
        value={value.phone}
        onChange={(e) => onChange({ ...value, phone: e.target.value })}
      />
      <input
        className="input w-full"
        placeholder={t('customers.contactPosition')}
        aria-label={t('customers.contactPosition')}
        disabled={disabled}
        value={value.position ?? ''}
        onChange={(e) => onChange({ ...value, position: e.target.value || undefined })}
      />
    </div>
  );
}

/** PIC yang sudah ada: ubah data atau (non)aktifkan. API menolak menonaktifkan PIC aktif terakhir. */
function ContactRow({
  customerId,
  contact,
  readOnly,
  onChanged,
}: {
  customerId: string;
  contact: CustomerContactDto;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<CustomerContactInput>({
    name: contact.name,
    phone: contact.phone,
    position: contact.position ?? undefined,
  });

  const save = async (active: boolean) => {
    try {
      await updateCustomerContact(api, customerId, contact.id, { ...draft, active });
      notify('success', t('common.saved'));
      onChanged();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  return (
    <li className="flex flex-col gap-2 rounded-box border border-base-300 p-2">
      <div className="flex items-center gap-2">
        <Badge variant={contact.active ? 'success' : 'neutral'}>
          {contact.active ? t('common.active') : t('common.inactive')}
        </Badge>
      </div>
      <ContactFields value={draft} onChange={setDraft} disabled={readOnly} />
      {!readOnly && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="primary"
            icon={mdiContentSave}
            onClick={() => save(contact.active)}
          >
            {t('common.save')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => save(!contact.active)}>
            {contact.active ? t('common.deactivate') : t('common.activate')}
          </Button>
        </div>
      )}
    </li>
  );
}

export function CustomerModal({ customer, readOnly, onClose, onChanged }: CustomerModalProps) {
  const { t } = useTranslation();
  const [type, setType] = useState<CustomerType>(customer?.type ?? 'INDIVIDUAL');
  const [name, setName] = useState(customer?.name ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [address, setAddress] = useState(customer?.address ?? '');
  const [note, setNote] = useState(customer?.verificationNote ?? '');
  const [active, setActive] = useState(customer?.active ?? true);
  const [newContacts, setNewContacts] = useState<CustomerContactInput[]>([emptyContact()]);
  const [extraContact, setExtraContact] = useState<CustomerContactInput>(emptyContact());
  const [saving, setSaving] = useState(false);

  const fields = () => ({
    type,
    name,
    email: email || undefined,
    phone: phone || undefined,
    address: address || undefined,
    verificationNote: note || undefined,
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (customer) {
        await updateCustomer(api, customer.id, { ...fields(), active });
      } else {
        await createCustomer(api, { ...fields(), contacts: newContacts });
      }
      notify('success', t('common.saved'));
      onChanged();
      if (!customer) onClose();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    } finally {
      setSaving(false);
    }
  };

  const addContact = async () => {
    if (!customer) return;
    try {
      await addCustomerContact(api, customer.id, extraContact);
      setExtraContact(emptyContact());
      notify('success', t('common.saved'));
      onChanged();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  const title = customer ? customer.name : t('customers.new');

  return (
    <Modal open title={title} onClose={onClose} wide>
      <form onSubmit={submit} className="grid gap-2">
        <fieldset disabled={readOnly} className="grid gap-2 sm:grid-cols-2">
          <FormField label={t('customers.type')}>
            <select
              className="select w-full"
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
              className="input w-full"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
          <FormField label={t('customers.email')}>
            <input
              type="email"
              className="input w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>
          <FormField label={t('customers.phone')}>
            <input
              className="input w-full"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label={t('customers.address')}>
              <textarea
                className="textarea w-full"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField label={t('customers.verificationNote')}>
              <input
                className="input w-full"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </FormField>
          </div>
          {customer && (
            <label className="label cursor-pointer justify-start gap-2 sm:col-span-2">
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

        {!customer && (
          <div className="grid gap-2">
            <h3 className="font-semibold">{t('customers.contacts')}</h3>
            <p className="text-sm">{t('customers.contactRequired')}</p>
            {newContacts.map((contact, index) => (
              <div key={index} className="flex items-start gap-2">
                <div className="flex-1">
                  <ContactFields
                    value={contact}
                    onChange={(next) =>
                      setNewContacts((all) => all.map((c, i) => (i === index ? next : c)))
                    }
                  />
                </div>
                {newContacts.length > 1 && (
                  <Button
                    variant="ghost"
                    onClick={() => setNewContacts((all) => all.filter((_, i) => i !== index))}
                  >
                    {t('common.remove')}
                  </Button>
                )}
              </div>
            ))}
            <div>
              <Button
                size="sm"
                variant="ghost"
                icon={mdiPlus}
                onClick={() => setNewContacts((all) => [...all, emptyContact()])}
              >
                {t('customers.addContact')}
              </Button>
            </div>
          </div>
        )}

        {!readOnly && (
          <div className="modal-action">
            <Button type="submit" variant="primary" icon={mdiContentSave} loading={saving}>
              {t('common.save')}
            </Button>
          </div>
        )}
      </form>

      {customer && (
        <div className="mt-4 grid gap-2">
          <h3 className="font-semibold">{t('customers.contacts')}</h3>
          <ul className="grid gap-2">
            {customer.contacts.map((contact) => (
              <ContactRow
                key={`${contact.id}-${contact.name}-${contact.phone}-${contact.position}-${contact.active}`}
                customerId={customer.id}
                contact={contact}
                readOnly={readOnly}
                onChanged={onChanged}
              />
            ))}
          </ul>
          {!readOnly && (
            <div className="grid gap-2 rounded-box border border-dashed border-base-300 p-2">
              <ContactFields value={extraContact} onChange={setExtraContact} />
              <div>
                <Button
                  size="sm"
                  variant="primary"
                  icon={mdiPlus}
                  disabled={!extraContact.name || extraContact.phone.length < 3}
                  onClick={addContact}
                >
                  {t('customers.addContact')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
