import { useState } from 'react';
import { mdiSignatureFreehand } from '@mdi/js';
import { portalSignDocument } from '@eventra/api-client';
import type { PortalDocumentDto } from '@eventra/shared';
import { api } from '@/api';
import { notify } from '@/lib/notifications';
import { Button } from './Button';
import { SignaturePad } from './SignaturePad';
import { Choice, Muted } from './ui';

/** Form tanda tangan pelanggan pada dokumen pesanannya (peran penerima/pengembali). */
export function PortalDocumentSign({
  doc,
  customerName,
  onSigned,
}: {
  doc: PortalDocumentDto;
  /** Pemesan: penanda tangan bawaan bila tidak memilih PIC. */
  customerName: string;
  onSigned: () => void;
}) {
  // '' = pemesan sendiri; selain itu id PIC pelanggan/lapangan pada pesanan.
  const [picId, setPicId] = useState('');
  const [image, setImage] = useState<string | null>(null);

  const submit = async () => {
    if (!image) return;
    try {
      await portalSignDocument(api, doc.id, { ...(picId ? { picId } : {}), image });
      notify('success', 'Dokumen ditandatangani.');
      onSigned();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  return (
    <div className="ev-sign">
      {doc.signers.length > 0 ? (
        <Choice
          label="Penanda tangan"
          value={picId}
          options={[
            { value: '', label: `${customerName} (pemesan)` },
            ...doc.signers.map((s) => ({ value: s.id, label: s.name })),
          ]}
          onChange={setPicId}
        />
      ) : (
        <Muted>Penanda tangan: {customerName} (pemesan)</Muted>
      )}
      <Muted>Tanda tangan di kotak di bawah dengan jari. Tanda tangan tidak dapat diubah.</Muted>
      <SignaturePad onChange={setImage} />
      <Button
        icon={mdiSignatureFreehand}
        className="ev-btn--block"
        disabled={!image}
        onClick={submit}
      >
        Tanda tangani
      </Button>
    </div>
  );
}
