import { useSyncExternalStore } from 'react';
import { mdiAlert, mdiAlertCircle, mdiCheckCircle, mdiClose, mdiInformation } from '@mdi/js';
import { getConfirm, subscribeConfirm } from '@/lib/confirm';
import { dismiss, getNotifications, subscribe, type NotificationType } from '@/lib/notifications';
import { Button } from './Button';
import { Icon } from './Icon';

const ALERT: Record<NotificationType, { cls: string; icon: string }> = {
  error: { cls: 'alert-error', icon: mdiAlertCircle },
  success: { cls: 'alert-success', icon: mdiCheckCircle },
  warning: { cls: 'alert-warning', icon: mdiAlert },
  info: { cls: 'alert-info', icon: mdiInformation },
};

/** Toast notifikasi (error API, sukses aksi). Dirender sekali di Layout. */
export function ToastHost() {
  const items = useSyncExternalStore(subscribe, getNotifications, getNotifications);
  if (items.length === 0) return null;
  return (
    <div className="toast toast-top toast-center ev-toast">
      {items.map((n) => (
        <div key={n.id} role="alert" className={`alert ${ALERT[n.type].cls} ev-toast__item`}>
          <Icon path={ALERT[n.type].icon} />
          <span>{n.message}</span>
          <Button
            variant="ghost"
            size="xs"
            icon={mdiClose}
            aria-label="Tutup"
            onClick={() => dismiss(n.id)}
          />
        </div>
      ))}
    </div>
  );
}

/** Dialog konfirmasi untuk aksi yang tidak dapat dibatalkan (`confirm()` dari lib/confirm). */
export function ConfirmHost() {
  const request = useSyncExternalStore(subscribeConfirm, getConfirm, getConfirm);
  if (!request) return null;
  return (
    <dialog className="modal modal-open ev-modal" open>
      <div className="modal-box ev-modal__box">
        <h3 className="ev-modal__title">{request.title}</h3>
        <p>{request.message}</p>
        <div className="modal-action ev-modal__actions">
          <Button variant="ghost" onClick={() => request.resolve(false)}>
            Batal
          </Button>
          <Button onClick={() => request.resolve(true)}>{request.confirmLabel}</Button>
        </div>
      </div>
    </dialog>
  );
}
