import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getMovementCalendar, getMovementDay, getOwnerDashboard } from '@eventra/api-client';
import { eachDate, type AssetRankDto } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { AssetStatusBadge, ConditionBadge } from '@/components/assets/badges';
import { MovementList } from '@/components/orders/MovementList';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { StatTile } from '@/components/ui/StatTile';
import { useResource } from '@/hooks/useResource';
import { formatDate } from '@/lib/format';

const STALE_OPTIONS = [7, 14, 30, 60, 90];
const MOVEMENT_DAYS = 14;

const isoToday = () => new Date().toISOString().slice(0, 10);
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function RankTable({
  title,
  rows,
  countLabel,
}: {
  title: string;
  rows: AssetRankDto[];
  countLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <section>
      <h2 className="ev-section-title">{title}</h2>
      <div className="ev-table-wrap">
        <table className="table">
          <thead className="ev-table__head">
            <tr>
              <th>{t('dashboard.asset')}</th>
              <th>{t('dashboard.product')}</th>
              <th>{countLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.assetId} className="ev-table__row">
                <td>
                  <Link className="ev-link" to={`/assets/${r.assetId}`}>
                    {r.code}
                  </Link>
                </td>
                <td>{r.productName}</td>
                <td>{r.count}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="ev-table__empty">
                  {t('dashboard.noData')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [staleDays, setStaleDays] = useState(30);
  const [selected, setSelected] = useState<string | null>(null);
  const canOrders = can('order.read');

  const from = isoToday();
  const to = addDays(from, MOVEMENT_DAYS - 1);

  const dash = useResource(() => getOwnerDashboard(api, { staleDays }), `dash|${staleDays}`);
  const movement = useResource(
    () => (canOrders ? getMovementCalendar(api, from, to) : Promise.resolve(undefined)),
    `move|${from}`,
  );
  const detail = useResource(
    () => (canOrders && selected ? getMovementDay(api, selected) : Promise.resolve(undefined)),
    `day|${selected ?? ''}`,
  );

  const d = dash.data;
  const s = d?.byStatus;
  const byDate = new Map((movement.data ?? []).map((day) => [day.date, day]));

  return (
    <>
      <PageCard>
        <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')}>
          <label className="ev-filters__field">
            <span className="ev-table__hint">{t('dashboard.staleAfter')}</span>
            <select
              className="select select-sm ev-control ev-select--auto"
              value={staleDays}
              onChange={(e) => setStaleDays(Number(e.target.value))}
            >
              {STALE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {t('dashboard.staleDays', { count: n })}
                </option>
              ))}
            </select>
          </label>
        </PageHeader>

        {dash.loading && !d ? (
          <Loading />
        ) : (
          d &&
          s && (
            <>
              <div className="ev-stats">
                <StatTile title={t('dashboard.total')} value={d.totalAssets} />
                <StatTile title={t('dashboard.available')} value={s.AVAILABLE} />
                <StatTile title={t('dashboard.preparing')} value={s.RESERVED + s.PREPARED} />
                <StatTile
                  title={t('dashboard.out')}
                  value={s.CHECKED_OUT + s.IN_TRANSIT + s.RETURN_PENDING}
                />
                <StatTile title={t('dashboard.onSite')} value={s.ON_SITE + s.ISSUE_ON_SITE} />
                <StatTile title={t('dashboard.damaged')} value={d.damaged} alert={d.damaged > 0} />
                <StatTile title={t('dashboard.inService')} value={s.IN_SERVICE} />
                <StatTile
                  title={t('dashboard.quarantined')}
                  value={s.QUARANTINED}
                  alert={s.QUARANTINED > 0}
                />
                <StatTile title={t('dashboard.retired')} value={s.RETIRED} />
                <StatTile
                  title={t('dashboard.stale')}
                  value={d.staleCount}
                  hint={t('dashboard.staleHint', { count: d.staleDays })}
                  alert={d.staleCount > 0}
                />
                <StatTile
                  title={t('dashboard.openIncidents')}
                  value={d.openIncidents}
                  alert={d.openIncidents > 0}
                />
                <StatTile title={t('dashboard.openTickets')} value={d.openServiceTickets} />
              </div>
              {(can('incident.read') || can('service.read')) && (
                <div className="ev-detail__actions">
                  {can('incident.read') && (
                    <Link className="ev-link" to="/incidents">
                      {t('nav.incidents')}
                    </Link>
                  )}
                  {can('service.read') && (
                    <Link className="ev-link" to="/service-tickets">
                      {t('nav.service')}
                    </Link>
                  )}
                </div>
              )}
            </>
          )
        )}
      </PageCard>

      {d && (
        <PageCard>
          <h2 className="ev-section-title">{t('dashboard.staleTitle')}</h2>
          <div className="ev-table-wrap">
            <table className="table">
              <thead className="ev-table__head">
                <tr>
                  <th>{t('dashboard.asset')}</th>
                  <th>{t('dashboard.product')}</th>
                  <th>{t('dashboard.status')}</th>
                  <th>{t('dashboard.lastUpdate')}</th>
                </tr>
              </thead>
              <tbody>
                {d.staleAssets.map((a) => (
                  <tr key={a.assetId} className="ev-table__row">
                    <td>
                      <Link className="ev-link" to={`/assets/${a.assetId}`}>
                        {a.code}
                      </Link>
                    </td>
                    <td>{a.productName}</td>
                    <td>
                      <AssetStatusBadge status={a.status} />
                      <ConditionBadge condition={a.condition} />
                    </td>
                    <td>
                      {t('dashboard.daysAgo', { count: a.daysSince })}
                      <span className="ev-table__hint ev-table__hint--block">
                        {formatDate(a.lastUpdateAt.slice(0, 10))}
                      </span>
                    </td>
                  </tr>
                ))}
                {d.staleAssets.length === 0 && (
                  <tr>
                    <td colSpan={4} className="ev-table__empty">
                      {t('dashboard.noStale')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="ev-master__grid">
            <RankTable
              title={t('dashboard.mostRented')}
              rows={d.mostRented}
              countLabel={t('dashboard.rentals')}
            />
            <RankTable
              title={t('dashboard.mostDamaged')}
              rows={d.mostDamaged}
              countLabel={t('dashboard.incidentsCount')}
            />
          </div>
        </PageCard>
      )}

      {canOrders && (
        <PageCard>
          <PageHeader title={t('dashboard.movements')} subtitle={t('dashboard.movementsHint')}>
            <Link className="btn btn-ghost btn-sm" to="/calendar">
              {t('dashboard.openCalendar')}
            </Link>
          </PageHeader>
          {movement.loading && !movement.data ? (
            <Loading />
          ) : (
            <div className="ev-strip" role="list">
              {eachDate(from, to).map((date) => {
                const day = byDate.get(date);
                const active = (day?.outgoingOrders ?? 0) + (day?.returningOrders ?? 0) > 0;
                return (
                  <button
                    key={date}
                    type="button"
                    role="listitem"
                    className="ev-calendar__day"
                    data-today={date === from}
                    data-selected={date === selected}
                    data-active={active}
                    onClick={() => setSelected(date)}
                  >
                    <span className="ev-calendar__date">{formatDate(date)}</span>
                    {day && day.outgoingUnits > 0 && (
                      <span className="ev-calendar__out">
                        ↑ {day.outgoingOrders} · {day.outgoingUnits}
                      </span>
                    )}
                    {day && day.returningUnits > 0 && (
                      <span className="ev-calendar__in">
                        ↓ {day.returningOrders} · {day.returningUnits}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {selected &&
            (detail.loading && !detail.data ? (
              <Loading />
            ) : (
              detail.data && (
                <>
                  <h2 className="ev-section-title">{formatDate(selected)}</h2>
                  <div className="ev-master__grid">
                    <MovementList title={t('calendar.outgoing')} movements={detail.data.outgoing} />
                    <MovementList
                      title={t('calendar.returning')}
                      movements={detail.data.returning}
                    />
                  </div>
                </>
              )
            ))}
        </PageCard>
      )}
    </>
  );
}
