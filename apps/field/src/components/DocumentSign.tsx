import { useState } from 'react';
import { mdiSignatureFreehand } from '@mdi/js';
import { signHandoverDocument } from '@eventra/api-client';
import { SIGNER_ROLES, type HandoverDocumentDto, type SignerRole } from '@eventra/shared';
import { api } from '@/api';
import { notify } from '@/lib/notifications';
import { Button } from './Button';
import { SignaturePad } from './SignaturePad';
import { Card, Choice, Muted, Strong } from './ui';

const SIGNER_ROLE_LABEL: Record<SignerRole, string> = {
  WAREHOUSE: 'PIC gudang',
  COUNTERPART: 'Pihak penerima/pengembali',
};

/** Form tanda tangan dokumen serah-terima: pilih peran & penanda tangan, gambar, kirim. */
export function DocumentSign({
  doc,
  onSigned,
}: {
  doc: HandoverDocumentDto;
  onSigned: (doc: HandoverDocumentDto) => void;
}) {
  const signedRoles = doc.signatures.map((s) => s.role);
  const roles = SIGNER_ROLES.filter((r) => !signedRoles.includes(r));
  const [role, setRole] = useState<SignerRole>(roles[0] ?? 'WAREHOUSE');
  const [picId, setPicId] = useState('');
  const [image, setImage] = useState<string | null>(null);
  // Kunci ulang pad setelah berhasil agar canvas kosong.
  const [padKey, setPadKey] = useState(0);

  const pics =
    role === 'WAREHOUSE'
      ? doc.payload.warehousePic
        ? [{ id: doc.payload.warehousePic.id, name: doc.payload.warehousePic.name }]
        : []
      : doc.payload.counterpartPics.map((p) => ({ id: p.id, name: p.name }));
  const selected = pics.some((p) => p.id === picId) ? picId : (pics[0]?.id ?? '');

  const submit = async () => {
    if (!image || !selected) return;
    try {
      const signed = await signHandoverDocument(api, doc.id, { role, picId: selected, image });
      notify('success', 'Dokumen ditandatangani.');
      setImage(null);
      setPadKey((k) => k + 1);
      onSigned(signed);
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  return (
    <Card>
      <Strong>Tanda tangan dokumen</Strong>
      <Choice
        label="Peran penanda tangan"
        value={role}
        options={roles.map((r) => ({ value: r, label: SIGNER_ROLE_LABEL[r] }))}
        onChange={setRole}
      />
      <Choice
        label="Penanda tangan"
        value={selected}
        options={
          pics.length
            ? pics.map((p) => ({ value: p.id, label: p.name }))
            : [{ value: '', label: '-' }]
        }
        onChange={setPicId}
      />
      {pics.length === 0 && <Muted>Belum ada PIC untuk peran ini pada dokumen.</Muted>}
      <Muted>Tanda tangan di kotak di bawah dengan jari. Tanda tangan tidak dapat diubah.</Muted>
      <SignaturePad key={padKey} onChange={setImage} />
      <Button
        icon={mdiSignatureFreehand}
        className="ev-btn--block"
        disabled={!image || !selected}
        onClick={submit}
      >
        Tanda tangani
      </Button>
    </Card>
  );
}
