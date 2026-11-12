import { useState, type FormEvent } from 'react';
import { mdiContentSave, mdiDelete, mdiPlus } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import {
  createCategory,
  createLocation,
  deleteCategory,
  listCategories,
  listLocations,
  updateCategory,
  updateLocation,
} from '@eventra/api-client';
import type { CategoryDto, LocationDto } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { useResource } from '@/hooks/useResource';
import { notify } from '@/lib/notifications';

/** Menjalankan aksi; error API sudah dinotifikasi client, jadi cukup berhenti. */
async function attempt(action: () => Promise<unknown>, onDone: () => void, success: string) {
  try {
    await action();
    notify('success', success);
    onDone();
  } catch {
    /* error sudah tampil sebagai notifikasi */
  }
}

function CategoryRow({
  category,
  canWrite,
  onChanged,
}: {
  category: CategoryDto;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(category.name);
  return (
    <li className="ev-list__row">
      <input
        className="input input-sm ev-inline-form__input"
        aria-label={t('master.categoryName')}
        disabled={!canWrite}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {canWrite && (
        <>
          <Button
            size="sm"
            variant="primary"
            icon={mdiContentSave}
            disabled={!name.trim() || name === category.name}
            aria-label={t('common.save')}
            onClick={() =>
              attempt(
                () => updateCategory(api, category.id, { name }),
                onChanged,
                t('common.saved'),
              )
            }
          />
          <Button
            size="sm"
            variant="ghost"
            icon={mdiDelete}
            aria-label={t('common.delete')}
            onClick={() =>
              attempt(() => deleteCategory(api, category.id), onChanged, t('common.deleted'))
            }
          />
        </>
      )}
    </li>
  );
}

function Categories({ canWrite }: { canWrite: boolean }) {
  const { t } = useTranslation();
  const { data, loading, reload } = useResource(() => listCategories(api), 'categories');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    await attempt(
      () => createCategory(api, { name }),
      () => {
        setName('');
        reload();
      },
      t('common.saved'),
    );
    setSaving(false);
  };

  return (
    <PageCard>
      <h2 className="ev-section-title">{t('master.categories')}</h2>
      {loading && !data ? (
        <Loading />
      ) : (
        <ul className="ev-list">
          {data?.map((category) => (
            <CategoryRow
              key={`${category.id}-${category.name}`}
              category={category}
              canWrite={canWrite}
              onChanged={reload}
            />
          ))}
          {data?.length === 0 && <li>{t('common.empty')}</li>}
        </ul>
      )}
      {canWrite && (
        <form onSubmit={add} className="ev-inline-form">
          <input
            className="input input-sm ev-inline-form__input"
            placeholder={t('master.categoryName')}
            aria-label={t('master.categoryName')}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" size="sm" variant="primary" icon={mdiPlus} loading={saving}>
            {t('common.add')}
          </Button>
        </form>
      )}
    </PageCard>
  );
}

function Locations({ canWrite }: { canWrite: boolean }) {
  const { t } = useTranslation();
  const { data, loading, reload } = useResource(() => listLocations(api), 'locations');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    await attempt(
      () => createLocation(api, { name, address: address || undefined }),
      () => {
        setName('');
        setAddress('');
        reload();
      },
      t('common.saved'),
    );
    setSaving(false);
  };

  const toggle = (location: LocationDto) =>
    attempt(
      () =>
        updateLocation(api, location.id, {
          name: location.name,
          address: location.address ?? undefined,
          active: !location.active,
        }),
      reload,
      t('common.saved'),
    );

  return (
    <PageCard>
      <h2 className="ev-section-title">{t('master.locations')}</h2>
      {loading && !data ? (
        <Loading />
      ) : (
        <ul className="ev-list">
          {data?.map((location) => (
            <li key={location.id} className="ev-list__row">
              <span className="ev-list__grow">
                {location.name}
                {location.address && <span className="ev-list__hint">{location.address}</span>}
              </span>
              <Badge variant={location.active ? 'success' : 'neutral'}>
                {location.active ? t('common.active') : t('common.inactive')}
              </Badge>
              {canWrite && (
                <Button size="sm" variant="ghost" onClick={() => toggle(location)}>
                  {location.active ? t('common.deactivate') : t('common.activate')}
                </Button>
              )}
            </li>
          ))}
          {data?.length === 0 && <li>{t('common.empty')}</li>}
        </ul>
      )}
      {canWrite && (
        <form onSubmit={add} className="ev-inline-form">
          <input
            className="input input-sm ev-inline-form__input"
            placeholder={t('master.locationName')}
            aria-label={t('master.locationName')}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="input input-sm ev-inline-form__input"
            placeholder={t('master.locationAddress')}
            aria-label={t('master.locationAddress')}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <Button type="submit" size="sm" variant="primary" icon={mdiPlus} loading={saving}>
            {t('common.add')}
          </Button>
        </form>
      )}
    </PageCard>
  );
}

export function MasterPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canWrite = can('master.write');
  return (
    <div className="ev-master">
      <PageHeader title={t('master.title')} />
      <div className="ev-master__grid">
        <Categories canWrite={canWrite} />
        <Locations canWrite={canWrite} />
      </div>
    </div>
  );
}
