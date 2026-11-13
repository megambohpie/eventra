import { useEffect, useState } from 'react';
import { mdiCheck, mdiMagnify } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { formatCoordinates, type GeocodeResultDto, type LatLng } from '@eventra/shared';
import { searchPlaces } from '@eventra/api-client';
import { api } from '@/api';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { MapCanvasLazy } from '@/components/ui/MapCanvasLazy';
import { Modal } from '@/components/ui/Modal';

interface LocationSearchModalProps {
  open: boolean;
  initial: LatLng | null;
  onClose: () => void;
  onConfirm: (point: LatLng) => void;
}

/** Dialog besar: cari nama tempat/alamat atau klik peta, lalu konfirmasi titik. */
export function LocationSearchModal({
  open,
  initial,
  onClose,
  onConfirm,
}: LocationSearchModalProps) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResultDto[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [point, setPoint] = useState<LatLng | null>(initial);
  const [recenter, setRecenter] = useState(initial ? 1 : 0);

  // Pencarian otomatis (ditunda) saat mengetik; hasil usang diabaikan.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      searchPlaces(api, text, i18n.language.startsWith('en') ? 'en' : 'id')
        .then(
          (list) => {
            if (!cancelled) setResults(list);
          },
          () => {
            if (!cancelled) setResults(null); // error sudah tampil sebagai notifikasi
          },
        )
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, i18n.language]);

  const choose = (r: GeocodeResultDto) => {
    setPoint({ lat: r.lat, lng: r.lng });
    setRecenter((n) => n + 1);
  };

  return (
    <Modal open={open} title={t('orders.map.title')} onClose={onClose} wide>
      <div className="ev-mapdialog">
        <label className="input ev-control">
          <Icon path={mdiMagnify} />
          <input
            type="search"
            autoFocus
            placeholder={t('orders.map.searchPlaceholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim().length < 3) setResults(null);
            }}
          />
          {searching && <span className="loading loading-spinner loading-xs" />}
        </label>

        {results && (
          <ul className="menu ev-mapdialog__results">
            {results.length === 0 && <li className="ev-hint">{t('orders.map.noResults')}</li>}
            {results.map((r) => (
              <li key={`${r.lat},${r.lng},${r.label}`}>
                <button type="button" onClick={() => choose(r)}>
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        )}

        <MapCanvasLazy
          large
          value={point}
          onChange={setPoint}
          recenterKey={recenter}
          ariaLabel={t('orders.map.title')}
        />
        <p className="ev-hint">{point ? formatCoordinates(point) : t('orders.map.hint')}</p>

        <div className="ev-mapdialog__actions">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            icon={mdiCheck}
            disabled={!point}
            onClick={() => {
              if (point) onConfirm(point);
            }}
          >
            {t('orders.map.useThis')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
