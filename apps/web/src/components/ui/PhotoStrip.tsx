import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { mdiCamera } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { MAX_ASSET_PHOTOS, MAX_PHOTO_BYTES, PHOTO_MIME_TYPES } from '@eventra/shared';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { notifyError } from '@/lib/notifications';

interface PhotoStripProps {
  /** Id foto yang sudah tersimpan (urutan lama → baru). */
  photoIds: string[];
  /** Mengambil isi gambar (lewat Axios, butuh token). */
  load: (photoId: string) => Promise<Blob>;
  /** Mengunggah satu foto; bila tidak diberikan, strip hanya baca. */
  onAdd?: (file: File) => Promise<void>;
  title: string;
  hint?: string;
}

function Thumb({
  photoId,
  load,
  onOpen,
}: {
  photoId: string;
  load: PhotoStripProps['load'];
  onOpen: (src: string) => void;
}) {
  const [src, setSrc] = useState<string>();
  // Prop load biasanya fungsi baru tiap render; simpan di ref agar thumbnail tidak diambil ulang terus.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    let url: string | undefined;
    let cancelled = false;
    loadRef.current(photoId).then(
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
  }, [photoId]);
  if (!src) return <span className="ev-thumb skeleton" />;
  return (
    <button type="button" className="ev-photostrip__item" onClick={() => onOpen(src)}>
      <img className="ev-thumb ev-thumb--large" src={src} alt="" />
    </button>
  );
}

/** Foto bukti (maks. 5): thumbnail bisa diperbesar; tombol tambah membuka kamera/galeri. */
export function PhotoStrip({ photoIds, load, onAdd, title, hint }: PhotoStripProps) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const full = photoIds.length >= MAX_ASSET_PHOTOS;

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen || !onAdd) return;
    if (!(PHOTO_MIME_TYPES as readonly string[]).includes(chosen.type)) {
      notifyError(t('errors.INVALID_IMAGE'));
      return;
    }
    if (chosen.size > MAX_PHOTO_BYTES) {
      notifyError(t('errors.PAYLOAD_TOO_LARGE'));
      return;
    }
    try {
      await onAdd(chosen);
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  return (
    <section className="ev-photostrip">
      <h3 className="ev-section-title">{title}</h3>
      {hint && <p className="ev-hint">{hint}</p>}
      <div className="ev-photostrip__list">
        {photoIds.map((id) => (
          <Thumb key={id} photoId={id} load={load} onOpen={setZoom} />
        ))}
        {photoIds.length === 0 && <span className="ev-hint">{t('assets.photos.none')}</span>}
      </div>
      {onAdd && (
        <>
          <input
            ref={input}
            type="file"
            hidden
            accept={PHOTO_MIME_TYPES.join(',')}
            capture="environment"
            onChange={pick}
          />
          <Button
            size="sm"
            variant="secondary"
            icon={mdiCamera}
            disabled={full}
            onClick={() => input.current?.click()}
          >
            {full ? t('assets.photos.full', { max: MAX_ASSET_PHOTOS }) : t('assets.photos.add')}
          </Button>
        </>
      )}
      {zoom && (
        <Modal open wide title={title} onClose={() => setZoom(null)}>
          <img className="ev-photostrip__zoom" src={zoom} alt="" />
        </Modal>
      )}
    </section>
  );
}
