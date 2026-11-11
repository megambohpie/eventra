import { useSyncExternalStore } from 'react';
import { mdiAlert, mdiAlertCircle, mdiCheckCircle, mdiClose, mdiInformation } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import {
  dismiss,
  getNotifications,
  subscribe,
  type NotificationType,
} from '../../lib/notifications';
import { Button } from './Button';
import { Icon } from './Icon';

// Kelas ditulis utuh agar terdeteksi Tailwind.
const ALERT: Record<NotificationType, { cls: string; icon: string }> = {
  error: { cls: 'alert-error', icon: mdiAlertCircle },
  success: { cls: 'alert-success', icon: mdiCheckCircle },
  warning: { cls: 'alert-warning', icon: mdiAlert },
  info: { cls: 'alert-info', icon: mdiInformation },
};

/** Satu-satunya komponen notifikasi. Dirender sekali di Layout global. */
export function NotificationHost() {
  const { t } = useTranslation();
  const notifications = useSyncExternalStore(subscribe, getNotifications, getNotifications);

  if (notifications.length === 0) return null;
  return (
    <div className="toast toast-top toast-end z-50 print:hidden">
      {notifications.map((n) => (
        <div key={n.id} role="alert" className={`alert ${ALERT[n.type].cls} shadow-lg`}>
          <Icon path={ALERT[n.type].icon} />
          <span>{n.message}</span>
          <Button
            variant="ghost"
            size="xs"
            icon={mdiClose}
            aria-label={t('common.close')}
            onClick={() => dismiss(n.id)}
          />
        </div>
      ))}
    </div>
  );
}
