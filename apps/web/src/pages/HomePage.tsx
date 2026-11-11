import { useCallback, useEffect, useState } from 'react';
import { mdiRefresh } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { getHealth } from '@eventra/api-client';
import type { HealthResponse } from '@eventra/shared';
import { api } from '../api';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Loading } from '../components/ui/Loading';

type State = { kind: 'loading' } | { kind: 'ok'; health: HealthResponse } | { kind: 'error' };

export function HomePage() {
  const { t } = useTranslation();
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

  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body">
        <h1 className="card-title">{t('home.title')}</h1>
        <p>{t('home.statusIntro')}</p>
        {state.kind === 'loading' && <Loading />}
        {state.kind === 'ok' && (
          <div className="flex gap-2">
            <Badge variant={state.health.status === 'ok' ? 'success' : 'warning'}>
              {t('home.api')}: {state.health.status}
            </Badge>
            <Badge variant={state.health.db === 'up' ? 'success' : 'error'}>
              {t('home.db')}: {state.health.db}
            </Badge>
          </div>
        )}
        <div className="card-actions">
          <Button variant="primary" icon={mdiRefresh} onClick={load}>
            {t('home.recheck')}
          </Button>
        </div>
      </div>
    </div>
  );
}
