import { useEffect, useState } from 'react';
import { mdiImageOutline } from '@mdi/js';
import { getProductPhoto } from '@eventra/api-client';
import { api } from '@/api';
import { Icon } from '@/components/ui/Icon';

interface ProductThumbProps {
  productId: string;
  hasPhoto: boolean;
  /** Berubah setiap daftar dimuat ulang agar foto yang diganti ikut diambil ulang. */
  version?: number;
}

/** Thumbnail foto produk untuk tabel; tanpa foto tampil ikon placeholder. */
export function ProductThumb({ productId, hasPhoto, version = 0 }: ProductThumbProps) {
  const [loaded, setLoaded] = useState<{ key: string; src: string }>();
  const key = `${productId}|${version}`;

  useEffect(() => {
    if (!hasPhoto) return;
    let url: string | undefined;
    let cancelled = false;
    getProductPhoto(api, productId).then(
      (blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setLoaded({ key, src: url });
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [productId, hasPhoto, key]);

  if (!hasPhoto) {
    return (
      <span className="ev-thumb ev-thumb--empty">
        <Icon path={mdiImageOutline} />
      </span>
    );
  }
  return loaded?.key === key ? (
    <img className="ev-thumb" src={loaded.src} alt="" />
  ) : (
    <span className="ev-thumb skeleton" />
  );
}
