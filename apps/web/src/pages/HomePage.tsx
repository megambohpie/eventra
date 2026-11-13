import { useCallback, useEffect, useState } from 'react';
import {
  mdiAccountGroup,
  mdiArrowRight,
  mdiCube,
  mdiMapMarker,
  mdiQrcode,
  mdiPulse,
  mdiRefresh,
  mdiWarehouse,
} from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  getAssetSummary,
  getHealth,
  listCategories,
  listCustomers,
  listLocations,
  listProducts,
} from '@eventra/api-client';
import type { Capability, HealthResponse } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { OrderCalendar } from '@/components/orders/OrderCalendar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Loading } from '@/components/ui/Loading';
import { PageCard } from '@/components/ui/PageCard';
import { useResource } from '@/hooks/useResource';

type State = { kind: 'loading' } | { kind: 'ok'; health: HealthResponse } | { kind: 'error' };

interface Shortcut {
  to: string;
  labelKey: string;
  icon: string;
  capability: Capability;
  count: () => Promise<number>;
}

const SHORTCUTS: Shortcut[] = [
  {
    to: '/customers',
    labelKey: 'nav.customers',
    icon: mdiAccountGroup,
    capability: 'customer.read',
    count: async () => (await listCustomers(api, { pageSize: 1 })).total,
  },
  {
    to: '/products',
    labelKey: 'nav.products',
    icon: mdiCube,
    capability: 'product.read',
    count: async () => (await listProducts(api, { pageSize: 1 })).total,
  },
  {
    to: '/assets',
    labelKey: 'nav.assets',
    icon: mdiQrcode,
    capability: 'asset.read',
    count: async () => (await getAssetSummary(api)).total,
  },
  {
    to: '/master',
    labelKey: 'master.categories',
    icon: mdiMapMarker,
    capability: 'master.read',
    count: async () => (await listCategories(api)).length,
  },
  {
    to: '/master',
    labelKey: 'master.locations',
    icon: mdiWarehouse,
    capability: 'master.read',
    count: async () => (await listLocations(api)).length,
  },
];

function ShortcutCard({ shortcut }: { shortcut: Shortcut }) {
  const { t } = useTranslation();
  const { data, loading } = useResource(shortcut.count, shortcut.labelKey);
  return (
    <Link to={shortcut.to} className="card ev-shortcut">
      <div className="card-body ev-shortcut__body">
        <div className="ev-shortcut__top">
          <span className="ev-shortcut__badge">
            <Icon path={shortcut.icon} />
          </span>
          <Icon path={mdiArrowRight} className="ev-shortcut__arrow" />
        </div>
        <div>
          <p className="ev-shortcut__count">
            {loading ? <span className="ev-dots" /> : (data ?? '-')}
          </p>
          <p className="ev-shortcut__label">{t(shortcut.labelKey)}</p>
        </div>
      </div>
    </Link>
  );
}

export function HomePage() {
  const { t } = useTranslation();
  const { user, can } = useAuth();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    try {
      setState({ kind: 'ok', health: await getHealth(api) });
    } catch {
      // Notifikasi error ditampilkan otomatis oleh client Axios.
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load();
  }, [load]);

  const shortcuts = SHORTCUTS.filter((s) => can(s.capability));

  return (
    <div className="ev-home">
      {can('order.read') && <OrderCalendar />}

      <section className="ev-hero">
        <Icon path={mdiWarehouse} className="ev-hero__art" />
        <p className="ev-hero__eyebrow">{t('home.title')}</p>
        <h1 className="ev-hero__title">{t('home.welcome', { name: user?.name ?? '' })}</h1>
        <p className="ev-hero__text">{t('home.welcomeSub')}</p>
      </section>

      {shortcuts.length > 0 && (
        <div className="ev-shortcuts">
          {shortcuts.map((shortcut) => (
            <ShortcutCard key={shortcut.labelKey} shortcut={shortcut} />
          ))}
        </div>
      )}

      <PageCard>
        <div className="ev-status">
          <div className="ev-status__lead">
            <span className="ev-status__badge">
              <Icon path={mdiPulse} />
            </span>
            <div>
              <h2 className="ev-status__title">{t('home.statusTitle')}</h2>
              <p className="ev-status__text">{t('home.statusIntro')}</p>
            </div>
          </div>
          <div className="ev-status__actions">
            {state.kind === 'loading' && <Loading />}
            {state.kind === 'ok' && (
              <>
                <Badge variant={state.health.status === 'ok' ? 'success' : 'warning'}>
                  {t('home.api')}: {state.health.status}
                </Badge>
                <Badge variant={state.health.db === 'up' ? 'success' : 'error'}>
                  {t('home.db')}: {state.health.db}
                </Badge>
              </>
            )}
            <Button size="sm" variant="ghost" icon={mdiRefresh} onClick={load}>
              {t('home.recheck')}
            </Button>
          </div>
        </div>
      </PageCard>
    </div>
  );
}
