import { useEffect, useState } from 'react';
import { mdiBell } from '@mdi/js';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@eventra/api-client';
import type { NotificationDto, NotificationListDto } from '@eventra/shared';
import { api } from '@/api';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { formatDateTime } from '@/lib/format';

const POLL_MS = 60_000;

/** Tujuan klik notifikasi menurut jenis entitasnya. */
function targetOf(n: NotificationDto): string {
  if (n.entity === 'incident') return `/incidents/${n.entityId}`;
  // Penerima (PIC lapangan) tidak punya akses gudang: arahkan ke insiden terkait bila tersedia.
  return n.params.incidentId ? `/incidents/${n.params.incidentId}` : `/replacements/${n.entityId}`;
}

/** Terjemahkan kode keputusan/urgensi pada parameter agar kalimat notifikasi mudah dibaca. */
function describe(params: Record<string, string>, t: TFunction): Record<string, string> {
  const out = { ...params };
  if (params.decision) out.decision = t(`incidents.decisions.${params.decision}`);
  if (params.urgency) out.urgency = t(`incidents.urgencies.${params.urgency}`);
  return out;
}

/** Lonceng notifikasi dalam aplikasi (insiden baru, keputusan, penggantian). Polling ringan tiap menit. */
export function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [state, setState] = useState<NotificationListDto>({ items: [], unread: 0 });

  const refresh = async () => {
    try {
      setState(await listNotifications(api));
    } catch {
      /* error sudah tampil sebagai notifikasi; lonceng tetap memakai data terakhir */
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      listNotifications(api).then(
        (data) => {
          if (!cancelled) setState(data);
        },
        () => undefined,
      );
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const open = async (n: NotificationDto) => {
    if (!n.readAt) await markNotificationRead(api, n.id).catch(() => undefined);
    navigate(targetOf(n));
    await refresh();
  };

  return (
    <div className="dropdown dropdown-end">
      <div
        tabIndex={0}
        role="button"
        className="btn btn-ghost btn-sm ev-bell"
        aria-label={t('notifications.title')}
        onFocus={() => void refresh()}
      >
        <Icon path={mdiBell} />
        {state.unread > 0 && (
          <span className="badge badge-error badge-xs ev-bell__count">{state.unread}</span>
        )}
      </div>
      <div tabIndex={0} className="dropdown-content card ev-bell__panel">
        <div className="card-body ev-bell__body">
          <div className="ev-bell__head">
            <h2 className="ev-bell__title">{t('notifications.title')}</h2>
            {state.unread > 0 && (
              <Button
                size="xs"
                variant="ghost"
                onClick={async () => {
                  await markAllNotificationsRead(api).catch(() => undefined);
                  await refresh();
                }}
              >
                {t('notifications.readAll')}
              </Button>
            )}
          </div>
          {state.items.length === 0 ? (
            <p className="ev-hint">{t('notifications.empty')}</p>
          ) : (
            <ul className="menu ev-bell__list">
              {state.items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className="ev-bell__item"
                    data-unread={!n.readAt}
                    onClick={() => void open(n)}
                  >
                    <span>{t(`notifications.types.${n.type}`, describe(n.params, t))}</span>
                    <span className="ev-table__hint">{formatDateTime(n.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
