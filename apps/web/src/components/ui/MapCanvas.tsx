import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { roundCoord, type LatLng } from '@eventra/shared';

interface MapCanvasProps {
  value: LatLng | null;
  /** Tanpa onChange peta hanya pratinjau (tidak bisa digeser/diklik). */
  onChange?: (point: LatLng) => void;
  /** Berubah = peta dipusatkan ulang ke titik (mis. hasil pencarian). */
  recenterKey?: number;
  /** Peta bisa digeser/diperbesar walau titik tidak dapat diubah (dialog lihat lokasi). */
  navigable?: boolean;
  ariaLabel: string;
}

/** Pusat awal peta (Jakarta) bila belum ada titik. */
const DEFAULT_CENTER: [number, number] = [-6.2088, 106.8456];

const toPoint = (ll: L.LatLng): LatLng => ({
  lat: roundCoord(ll.lat),
  lng: roundCoord(ll.lng),
});

/** Peta Leaflet: klik atau seret penanda untuk memilih titik. Dimuat malas oleh LocationPicker. */
export default function MapCanvas({
  value,
  onChange,
  recenterKey = 0,
  navigable = false,
  ariaLabel,
}: MapCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const change = useRef(onChange);
  const interactive = Boolean(onChange);

  useEffect(() => {
    change.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!host.current) return;
    const instance = L.map(host.current, {
      scrollWheelZoom: false,
      ...(interactive || navigable
        ? {}
        : {
            dragging: false,
            zoomControl: false,
            doubleClickZoom: false,
            touchZoom: false,
            keyboard: false,
          }),
    }).setView(value ? [value.lat, value.lng] : DEFAULT_CENTER, value ? 16 : 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(instance);
    if (interactive) {
      instance.on('click', (e: L.LeafletMouseEvent) => change.current?.(toPoint(e.latlng)));
    }
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
      marker.current = null;
    };
    // Peta dibuat sekali; perubahan titik ditangani efek di bawah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    const latlng: [number, number] = [value.lat, value.lng];
    if (marker.current) {
      marker.current.setLatLng(latlng);
    } else {
      const pin = L.marker(latlng, {
        draggable: interactive,
        icon: L.divIcon({
          className: 'ev-map__pin',
          html: '<span class="ev-map__pin-dot"></span>',
          iconSize: [28, 28],
          iconAnchor: [14, 28],
        }),
      }).addTo(instance);
      pin.on('dragend', () => change.current?.(toPoint(pin.getLatLng())));
      marker.current = pin;
    }
    if (!interactive) instance.setView(latlng, 16);
    else if (!instance.getBounds().contains(latlng)) instance.setView(latlng, instance.getZoom());
  }, [value, interactive]);

  useEffect(() => {
    if (recenterKey > 0 && value) map.current?.setView([value.lat, value.lng], 17);
    // Hanya saat kunci berubah; nilai terkini dibaca saat itu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterKey]);

  return (
    <div
      ref={host}
      className="ev-map__canvas"
      role={interactive ? 'application' : 'img'}
      aria-label={ariaLabel}
    />
  );
}
