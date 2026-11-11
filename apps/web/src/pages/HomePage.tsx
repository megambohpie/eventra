import { useCallback, useEffect, useState } from 'react';
import {
  mdiAccountGroup,
  mdiArrowRight,
  mdiCube,
  mdiMapMarker,
  mdiPulse,
  mdiRefresh,
  mdiWarehouse,
} from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  getHealth,
  listCategories,
  listCustomers,
  listLocations,
  listProducts,
} from '@eventra/api-client';
import type { Capability, HealthResponse } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
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
    <Link
      to={shortcut.to}
      className="card rounded-3xl border border-base-300/40 bg-base-100 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
    >
      <div className="card-body gap-3 p-5">
        <div className="flex items-center justify-between">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon path={shortcut.icon} size={1.5} />
          </span>
          <Icon path={mdiArrowRight} className="opacity-40" />
        </div>
        <div>
          <p className="text-3xl font-bold">
            {loading ? <span className="loading loading-dots loading-sm" /> : (data ?? '-')}
          </p>
          <p className="text-sm text-base-content/60">{t(shortcut.labelKey)}</p>
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
    <div className="grid gap-6">
      <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-primary to-secondary p-6 text-primary-content shadow-lg sm:p-10">
        <Icon
          path={mdiWarehouse}
          size={11}
          className="pointer-events-none absolute -right-6 -bottom-8 opacity-15"
        />
        <p className="text-sm font-medium opacity-80">{t('home.title')}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
          {t('home.welcome', { name: user?.name ?? '' })}
        </h1>
        <p className="mt-2 max-w-xl opacity-90">{t('home.welcomeSub')}</p>
      </section>

      {shortcuts.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {shortcuts.map((shortcut) => (
            <ShortcutCard key={shortcut.labelKey} shortcut={shortcut} />
          ))}
        </div>
      )}

      <PageCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-success/15 text-success">
              <Icon path={mdiPulse} />
            </span>
            <div>
              <h2 className="font-semibold">{t('home.statusTitle')}</h2>
              <p className="text-sm text-base-content/60">{t('home.statusIntro')}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
