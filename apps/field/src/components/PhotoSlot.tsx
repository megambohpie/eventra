import { useEffect, useMemo, useRef } from 'react';
import { mdiCamera } from '@mdi/js';
import { PHOTO_MIME_TYPES } from '@eventra/shared';
import { notifyError } from '@/lib/notifications';
import { Button } from './Button';

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

function Preview({ file }: { file: File }) {
  const src = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(src), [src]);
  return <img className="ev-thumb" src={src} alt="" />;
}

/** Ambil satu foto dari kamera/galeri (JPEG/PNG ≤ 3 MB; dicek lagi oleh backend). */
export function PhotoSlot({
  label,
  file,
  onChange,
}: {
  label: string;
  file: File | undefined;
  onChange: (file: File | undefined) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  const pick = (picked: File | undefined) => {
    if (!picked) return;
    if (!(PHOTO_MIME_TYPES as readonly string[]).includes(picked.type)) {
      notifyError('Foto harus berformat JPEG atau PNG.');
      return;
    }
    if (picked.size > MAX_PHOTO_BYTES) {
      notifyError('Foto terlalu besar (maksimal 3 MB). Coba ambil ulang.');
      return;
    }
    onChange(picked);
  };

  return (
    <div className="ev-photo-slot" data-missing={!file}>
      <span className="ev-photo-slot__label">{label}</span>
      <div className="ev-photo-slot__body">
        {file && <Preview file={file} />}
        <input
          ref={input}
          type="file"
          hidden
          accept={PHOTO_MIME_TYPES.join(',')}
          capture="environment"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <Button size="sm" variant="ghost" icon={mdiCamera} onClick={() => input.current?.click()}>
          {file ? 'Ulangi foto' : 'Ambil foto'}
        </Button>
      </div>
    </div>
  );
}
