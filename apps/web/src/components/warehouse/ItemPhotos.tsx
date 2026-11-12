import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { mdiCamera } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { getReturnPhoto, uploadReturnPhoto } from '@eventra/api-client';
import { MAX_RETURN_PHOTOS, PHOTO_MIME_TYPES, type PickItemDto } from '@eventra/shared';
import { api } from '@/api';
import { Button } from '@/components/ui/Button';
import { notify, notifyError } from '@/lib/notifications';

function PhotoThumb({ pickListId, itemId, photoId }: Record<string, string>) {
  const [src, setSrc] = useState<string>();

  useEffect(() => {
    let url: string | undefined;
    let cancelled = false;
    getReturnPhoto(api, pickListId ?? '', itemId ?? '', photoId ?? '').then(
      (blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [pickListId, itemId, photoId]);

  return src ? (
    <a href={src} target="_blank" rel="noreferrer">
      <img className="ev-thumb" src={src} alt="" />
    </a>
  ) : (
    <span className="ev-thumb ev-thumb--loading skeleton" />
  );
}

interface ItemPhotosProps {
  pickListId: string;
  item: PickItemDto;
  canUpload: boolean;
  onChanged: () => void;
}

/** Foto kondisi saat pengembalian (maks. 5 per aset; validasi final ada di backend). */
export function ItemPhotos({ pickListId, item, canUpload, onChanged }: ItemPhotosProps) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!(PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) {
      notifyError(t('errors.INVALID_IMAGE'));
      return;
    }
    setBusy(true);
    try {
      await uploadReturnPhoto(api, pickListId, item.id, file);
      notify('success', t('warehouse.detail.photoAdded'));
      onChanged();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ev-thumbs">
      {item.photoIds.map((photoId) => (
        <PhotoThumb key={photoId} pickListId={pickListId} itemId={item.id} photoId={photoId} />
      ))}
      {canUpload && item.photoIds.length < MAX_RETURN_PHOTOS && (
        <>
          <input
            ref={input}
            type="file"
            hidden
            accept={PHOTO_MIME_TYPES.join(',')}
            onChange={pick}
          />
          <Button
            size="xs"
            variant="ghost"
            icon={mdiCamera}
            loading={busy}
            onClick={() => input.current?.click()}
          >
            {t('warehouse.detail.addPhoto')}
          </Button>
        </>
      )}
    </div>
  );
}
