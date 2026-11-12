import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { mdiCamera, mdiClose } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { getProductPhoto } from '@eventra/api-client';
import { MAX_PHOTO_BYTES, PHOTO_MIME_TYPES } from '@eventra/shared';
import { api } from '@/api';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { notifyError } from '@/lib/notifications';

interface ProductPhotoFieldProps {
  /** Id produk bila sudah tersimpan dan punya foto; foto lama ditampilkan sebagai pratinjau. */
  productId?: string;
  hasPhoto: boolean;
  /** Berkas baru yang dipilih (belum diunggah). */
  file: File | null;
  removed: boolean;
  readOnly: boolean;
  onFile: (file: File | null) => void;
  onRemove: (removed: boolean) => void;
}

/** Foto produk opsional: bisa dipilih, diganti, atau dihapus; diunggah saat produk disimpan. */
export function ProductPhotoField({
  productId,
  hasPhoto,
  file,
  removed,
  readOnly,
  onFile,
  onRemove,
}: ProductPhotoFieldProps) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [existing, setExisting] = useState<string>();

  useEffect(() => {
    if (!productId || !hasPhoto) return;
    let url: string | undefined;
    let cancelled = false;
    getProductPhoto(api, productId).then(
      (blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setExisting(url);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [productId, hasPhoto]);

  const picked = useMemo(() => (file ? URL.createObjectURL(file) : undefined), [file]);
  useEffect(() => {
    return () => {
      if (picked) URL.revokeObjectURL(picked);
    };
  }, [picked]);

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) return;
    if (!(PHOTO_MIME_TYPES as readonly string[]).includes(chosen.type)) {
      notifyError(t('errors.INVALID_IMAGE'));
      return;
    }
    if (chosen.size > MAX_PHOTO_BYTES) {
      notifyError(t('errors.PAYLOAD_TOO_LARGE'));
      return;
    }
    onFile(chosen);
    onRemove(false);
  };

  const src = picked ?? (removed ? undefined : existing);

  return (
    <FormField label={t('products.photoOptional')}>
      <div className="ev-photo-field">
        {src ? (
          <img className="ev-thumb ev-thumb--large" src={src} alt="" />
        ) : (
          <span className="ev-hint">{t('products.noPhoto')}</span>
        )}
        {!readOnly && (
          <div className="ev-photo-field__actions">
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
              onClick={() => input.current?.click()}
            >
              {src ? t('products.changePhoto') : t('products.addPhoto')}
            </Button>
            {src && (
              <Button
                size="sm"
                variant="ghost"
                icon={mdiClose}
                onClick={() => {
                  onFile(null);
                  onRemove(hasPhoto);
                }}
              >
                {t('products.removePhoto')}
              </Button>
            )}
          </div>
        )}
      </div>
    </FormField>
  );
}
