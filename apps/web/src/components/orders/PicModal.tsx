import { useState, type FormEvent } from 'react';
import { mdiContentSave } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { addOrderPic, updateOrderPic } from '@eventra/api-client';
import {
  INTERNAL_ONLY_PIC_ROLES,
  PIC_ROLES,
  PIC_SOURCES,
  WAREHOUSE_PIC_USER_ROLES,
  type OrderPicDto,
  type PicRole,
  type PicSource,
  type UserDto,
} from '@eventra/shared';
import { api } from '@/api';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { sanitizePhone } from '@/lib/format';
import { notify } from '@/lib/notifications';

const SELECTABLE_PIC_ROLES: readonly PicRole[] = ['WAREHOUSE_OUT', 'FIELD'];

interface PicModalProps {
  orderId: string;
  pic?: OrderPicDto;
  /** Peran yang sudah terisi (hanya satu per pesanan) agar tidak ditawarkan lagi. */
  takenRoles: PicRole[];
  /** Pengguna internal; kosong bila pengguna tidak berhak membaca daftar pengguna. */
  users: UserDto[];
  onClose: () => void;
  onChanged: () => void;
}

export function PicModal({ orderId, pic, takenRoles, users, onClose, onChanged }: PicModalProps) {
  const { t } = useTranslation();
  // Alur ringkas: hanya PIC gudang dan PIC lapangan (peran lama tetap tampil bila sedang diubah).
  const roles = PIC_ROLES.filter(
    (r) => r === pic?.role || (SELECTABLE_PIC_ROLES.includes(r) && !takenRoles.includes(r)),
  );
  const [role, setRole] = useState<PicRole>(pic?.role ?? roles[0] ?? 'WAREHOUSE_OUT');
  const [source, setSource] = useState<PicSource>(pic?.source ?? 'OWNER');
  const [userId, setUserId] = useState(pic?.userId ?? '');
  const [name, setName] = useState(pic?.source === 'OWNER' ? '' : (pic?.name ?? ''));
  const [phone, setPhone] = useState(pic?.source === 'OWNER' ? '' : (pic?.phone ?? ''));
  const [organization, setOrganization] = useState(pic?.organization ?? '');
  const [authorization, setAuthorization] = useState(pic?.authorization ?? '');
  const [saving, setSaving] = useState(false);

  const internalOnly = INTERNAL_ONLY_PIC_ROLES.includes(role);
  const effectiveSource: PicSource = internalOnly ? 'OWNER' : source;
  const candidates = users.filter(
    (u) =>
      u.active &&
      u.role !== 'CUSTOMER' &&
      (!internalOnly || (WAREHOUSE_PIC_USER_ROLES as readonly string[]).includes(u.role)),
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const input =
        effectiveSource === 'OWNER'
          ? { role, source: effectiveSource, userId }
          : {
              role,
              source: effectiveSource,
              name,
              phone,
              organization,
              authorization: effectiveSource === 'THIRD_PARTY' ? authorization : undefined,
            };
      if (pic) await updateOrderPic(api, orderId, pic.id, input);
      else await addOrderPic(api, orderId, input);
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
    <Modal open title={pic ? t('orders.pics.edit') : t('orders.pics.add')} onClose={onClose}>
      <form onSubmit={submit}>
        <fieldset className="ev-form-grid">
          <FormField label={t('orders.pics.role')}>
            <select
              className="select ev-control"
              value={role}
              onChange={(e) => setRole(e.target.value as PicRole)}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {t(`orders.pics.roles.${r}`)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t('orders.pics.source')}>
            <select
              className="select ev-control"
              value={effectiveSource}
              disabled={internalOnly}
              onChange={(e) => setSource(e.target.value as PicSource)}
            >
              {PIC_SOURCES.filter((s) => s !== 'THIRD_PARTY' || s === effectiveSource).map((s) => (
                <option key={s} value={s}>
                  {t(`orders.pics.sources.${s}`)}
                </option>
              ))}
            </select>
          </FormField>
          {effectiveSource === 'OWNER' ? (
            <div className="ev-form-grid__full">
              <FormField label={t('orders.pics.user')}>
                <SearchSelect
                  ariaLabel={t('orders.pics.user')}
                  value={userId}
                  onChange={setUserId}
                  options={candidates.map((u) => ({
                    value: u.id,
                    label: `${u.name} (${t(`roles.${u.role}`)})`,
                  }))}
                />
              </FormField>
            </div>
          ) : (
            <>
              <FormField label={t('orders.pics.name')}>
                <input
                  className="input ev-control"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </FormField>
              <FormField label={t('orders.pics.phone')}>
                <input
                  className="input ev-control"
                  required
                  value={phone}
                  inputMode="tel"
                  maxLength={20}
                  onChange={(e) => setPhone(sanitizePhone(e.target.value))}
                />
              </FormField>
              <FormField label={t('orders.pics.organization')}>
                <input
                  className="input ev-control"
                  required={effectiveSource === 'THIRD_PARTY'}
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                />
              </FormField>
              {effectiveSource === 'THIRD_PARTY' && (
                <FormField label={t('orders.pics.authorization')}>
                  <input
                    className="input ev-control"
                    required
                    value={authorization}
                    onChange={(e) => setAuthorization(e.target.value)}
                  />
                </FormField>
              )}
            </>
          )}
        </fieldset>
        <div className="modal-action">
          <Button
            type="submit"
            variant="primary"
            icon={mdiContentSave}
            loading={saving}
            disabled={effectiveSource === 'OWNER' && !userId}
          >
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
