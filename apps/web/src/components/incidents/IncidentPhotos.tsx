import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { mdiCamera } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { getIncidentPhoto, uploadIncidentPhoto } from '@eventra/api-client';
import {
  INCIDENT_PHOTO_KINDS,
  MAX_INCIDENT_PHOTOS,
  PHOTO_MIME_TYPES,
  type IncidentPhotoKind,
} from '@eventra/shared';
import { api } from '@/api';
import { Button } from '@/components/ui/Button';
import { notify, notifyError } from '@/lib/notifications';

function PhotoThumb({ incidentId, photoId }: { incidentId: string; photoId: string }) {
  const [src, setSrc] = useState<string>();

  useEffect(() => {
    let url: string | undefined;
    let cancelled = false;
    getIncidentPhoto(api, incidentId, photoId).then(
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
  }, [incidentId, photoId]);

  return src ? (
    <a href={src} target="_blank" rel="noreferrer">
      <img className="ev-thumb ev-thumb--large" src={src} alt="" />
    </a>
  ) : (
    <span className="ev-thumb ev-thumb--large ev-thumb--loading skeleton" />
  );
}

interface IncidentPhotosProps {
  incidentId: string;
  photos: { id: string; kind: IncidentPhotoKind }[];
  /** Unggah hanya saat laporan masih draft; setelah dikirim bukti tidak berubah. */
  canUpload: boolean;
  onChanged: () => void;
}

/** Bukti foto insiden: wajib foto barang, kerusakan, dan barang dengan stiker aset (maks. 5 total; final di backend). */
export function IncidentPhotos({ incidentId, photos, canUpload, onChanged }: IncidentPhotosProps) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const target = useRef<IncidentPhotoKind>('ITEM');
  const [busy, setBusy] = useState<IncidentPhotoKind | null>(null);

  const choose = (kind: IncidentPhotoKind) => {
    target.current = kind;
    input.current?.click();
  };

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!(PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) {
      notifyError(t('errors.INVALID_IMAGE'));
      return;
    }
    const kind = target.current;
    setBusy(kind);
    try {
      await uploadIncidentPhoto(api, incidentId, file, kind);
      notify('success', t('incidents.photoAdded'));
      onChanged();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="ev-photo-kinds">
      {canUpload && <p className="ev-hint">{t('incidents.photosRequiredHint')}</p>}
      <input ref={input} type="file" hidden accept={PHOTO_MIME_TYPES.join(',')} onChange={pick} />
      {INCIDENT_PHOTO_KINDS.map((kind) => {
        const own = photos.filter((p) => p.kind === kind);
        return (
          <div key={kind} className="ev-photo-kinds__group" data-missing={own.length === 0}>
            <span className="ev-photo-kinds__label">{t(`incidents.photoKinds.${kind}`)}</span>
            <div className="ev-thumbs ev-thumbs--start">
              {own.map((p) => (
                <PhotoThumb key={p.id} incidentId={incidentId} photoId={p.id} />
              ))}
              {own.length === 0 && !canUpload && (
                <p className="ev-hint">{t('incidents.noPhotos')}</p>
              )}
              {canUpload && photos.length < MAX_INCIDENT_PHOTOS && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={mdiCamera}
                  loading={busy === kind}
                  onClick={() => choose(kind)}
                >
                  {t('incidents.addPhoto')}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
