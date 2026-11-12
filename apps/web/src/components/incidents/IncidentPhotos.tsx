import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { mdiCamera } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { getIncidentPhoto, uploadIncidentPhoto } from '@eventra/api-client';
import { MAX_INCIDENT_PHOTOS, PHOTO_MIME_TYPES } from '@eventra/shared';
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
  photoIds: string[];
  /** Unggah hanya saat laporan masih draft; setelah dikirim bukti tidak berubah. */
  canUpload: boolean;
  onChanged: () => void;
}

/** Bukti foto insiden: 1–5 foto (validasi final di backend). */
export function IncidentPhotos({
  incidentId,
  photoIds,
  canUpload,
  onChanged,
}: IncidentPhotosProps) {
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
      await uploadIncidentPhoto(api, incidentId, file);
      notify('success', t('incidents.photoAdded'));
      onChanged();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ev-thumbs ev-thumbs--start">
      {photoIds.map((photoId) => (
        <PhotoThumb key={photoId} incidentId={incidentId} photoId={photoId} />
      ))}
      {photoIds.length === 0 && !canUpload && <p className="ev-hint">{t('incidents.noPhotos')}</p>}
      {canUpload && photoIds.length < MAX_INCIDENT_PHOTOS && (
        <>
          <input
            ref={input}
            type="file"
            hidden
            accept={PHOTO_MIME_TYPES.join(',')}
            onChange={pick}
          />
          <Button
            size="sm"
            variant="ghost"
            icon={mdiCamera}
            loading={busy}
            onClick={() => input.current?.click()}
          >
            {t('incidents.addPhoto')}
          </Button>
        </>
      )}
    </div>
  );
}
