import { lazy, Suspense, type ComponentProps } from 'react';
import { Loading } from '@/components/ui/Loading';

const MapCanvas = lazy(() => import('@/components/ui/MapCanvas'));

type Props = ComponentProps<typeof MapCanvas> & { large?: boolean };

/** Peta Leaflet dimuat malas (±150 kB) agar tidak membebani halaman lain. */
export function MapCanvasLazy({ large = false, ...props }: Props) {
  return (
    <div className="ev-map" data-large={large}>
      <Suspense fallback={<Loading />}>
        <MapCanvas {...props} />
      </Suspense>
    </div>
  );
}
