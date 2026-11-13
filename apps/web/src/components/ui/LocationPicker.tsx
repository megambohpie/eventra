import { useState } from 'react';
import { mdiCrosshairsGps, mdiMagnify, mdiMapMarkerOff, mdiOpenInNew } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import {
  formatCoordinates,
  googleMapsUrl,
  parseCoordinates,
  roundCoord,
  type LatLng,
} from '@eventra/shared';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { FormField } from '@/components/ui/FormField';
import { LocationSearchModal } from '@/components/ui/LocationSearchModal';
import { Modal } from '@/components/ui/Modal';
import { MapCanvasLazy } from '@/components/ui/MapCanvasLazy';
import { notify } from '@/lib/notifications';

interface LocationPickerProps {
  value: LatLng | null;
  onChange: (point: LatLng | null) => void;
}

/**
 * Pemilih titik lokasi: klik/seret di peta, tempel koordinat atau tautan Google Maps,
 * atau pakai lokasi perangkat. Titik dapat dibuka kembali di Google Maps.
 */
export function LocationPicker({ value, onChange }: LocationPickerProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [dialog, setDialog] = useState(false);

  const apply = (text: string) => {
    setDraft(text);
    if (!text.trim()) {
      setInvalid(false);
      return;
    }
    const point = parseCoordinates(text);
    setInvalid(!point);
    if (point) {
      onChange(point);
      setDraft('');
    }
  };

  const useMyLocation = () =>
    new Promise<void>((resolve) => {
      if (!navigator.geolocation) {
        notify('error', t('orders.map.geoUnavailable'));
        resolve();
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          onChange({ lat: roundCoord(pos.coords.latitude), lng: roundCoord(pos.coords.longitude) });
          resolve();
        },
        () => {
          notify('error', t('orders.map.geoDenied'));
          resolve();
        },
        { enableHighAccuracy: true, timeout: 10_000 },
      );
    });

  return (
    <div className="ev-location">
      <FormField label={t('orders.map.paste')}>
        <input
          className={`input ev-control${invalid ? ' input-error' : ''}`}
          inputMode="decimal"
          placeholder="-6.208763, 106.845599"
          value={draft}
          aria-invalid={invalid}
          onChange={(e) => apply(e.target.value)}
        />
      </FormField>
      {invalid && <p className="ev-hint ev-hint--error">{t('orders.map.invalid')}</p>}

      <button
        type="button"
        className="ev-location__preview"
        aria-label={t('orders.map.openDialog')}
        onClick={() => setDialog(true)}
      >
        <MapCanvasLazy value={value} ariaLabel={t('orders.map.title')} />
        <span className="ev-location__cta">
          <Icon path={mdiMagnify} />
          {t('orders.map.openDialog')}
        </span>
      </button>
      <p className="ev-hint">{value ? formatCoordinates(value) : t('orders.map.hint')}</p>

      <div className="ev-location__actions">
        <Button size="sm" variant="ghost" icon={mdiCrosshairsGps} onClick={useMyLocation}>
          {t('orders.map.myLocation')}
        </Button>
        {value && (
          <>
            <a
              className="btn btn-ghost btn-sm"
              href={googleMapsUrl(value)}
              target="_blank"
              rel="noreferrer"
            >
              <Icon path={mdiOpenInNew} />
              {t('orders.map.openGoogle')}
            </a>
            <Button size="sm" variant="ghost" icon={mdiMapMarkerOff} onClick={() => onChange(null)}>
              {t('orders.map.clear')}
            </Button>
          </>
        )}
      </div>
      <LocationSearchModal
        key={String(dialog)}
        open={dialog}
        initial={value}
        onClose={() => setDialog(false)}
        onConfirm={(point) => {
          onChange(point);
          setDialog(false);
        }}
      />
    </div>
  );
}

/** Tampilan baca-saja: pratinjau peta yang bila diklik membuka dialog besar + tautan Google Maps. */
export function LocationView({ point, address }: { point: LatLng; address?: string | null }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="ev-location">
      <button
        type="button"
        className="ev-location__preview"
        aria-label={t('orders.map.viewDialog')}
        onClick={() => setOpen(true)}
      >
        <MapCanvasLazy value={point} ariaLabel={t('orders.map.title')} />
        <span className="ev-location__cta">
          <Icon path={mdiMagnify} />
          {t('orders.map.viewDialog')}
        </span>
      </button>
      <p className="ev-hint">{formatCoordinates(point)}</p>
      <Modal open={open} title={t('orders.map.title')} onClose={() => setOpen(false)} wide>
        <div className="ev-mapdialog">
          {address && <p>{address}</p>}
          <MapCanvasLazy large navigable value={point} ariaLabel={t('orders.map.title')} />
          <p className="ev-hint">{formatCoordinates(point)}</p>
          <div className="ev-mapdialog__actions">
            <a
              className="btn btn-primary"
              href={googleMapsUrl(point)}
              target="_blank"
              rel="noreferrer"
            >
              <Icon path={mdiOpenInNew} />
              {t('orders.map.openGoogle')}
            </a>
          </div>
        </div>
      </Modal>
    </div>
  );
}
