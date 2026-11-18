import { useState } from 'react';
import { mdiSend } from '@mdi/js';
import { useNavigate } from 'react-router-dom';
import { createIncident, submitIncident, uploadIncidentPhoto } from '@eventra/api-client';
import {
  INCIDENT_PHOTO_KINDS,
  INCIDENT_URGENCIES,
  type IncidentPhotoKind,
  type IncidentUrgency,
} from '@eventra/shared';
import { api } from '@/api';
import { INCIDENT_PHOTO_LABEL, URGENCY_LABEL } from '@/lib/labels';
import { notify, notifyError } from '@/lib/notifications';
import { Button } from './Button';
import { PhotoSlot } from './PhotoSlot';
import { SearchSelect } from './SearchSelect';
import { Choice, Field, Muted } from './ui';

type Photos = Partial<Record<IncidentPhotoKind, File>>;

const URGENCY_OPTIONS = INCIDENT_URGENCIES.map((value) => ({
  value,
  label: URGENCY_LABEL[value],
}));

/**
 * Formulir laporan kerusakan sekali jalan: pilih aset → isi masalah → tiga foto wajib → kirim.
 * Bila gagal setelah draft dibuat, buka detail insiden agar foto/pengiriman bisa dilanjutkan.
 */
export function IncidentReportForm({
  orderNumber,
  assets,
  initialAsset = '',
  detailBase = '/incidents',
}: {
  orderNumber: string;
  assets: { code: string; productName: string }[];
  /** Aset yang sudah terpilih (mis. dari tombol lapor pada daftar aset). */
  initialAsset?: string;
  /** Awalan rute detail insiden setelah laporan dibuat (`/p/incidents` untuk pelanggan). */
  detailBase?: string;
}) {
  const navigate = useNavigate();
  const [assetCode, setAssetCode] = useState(
    assets.some((a) => a.code === initialAsset) ? initialAsset : '',
  );
  const [urgency, setUrgency] = useState<IncidentUrgency>('MEDIUM');
  const [description, setDescription] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [photos, setPhotos] = useState<Photos>({});

  const submit = async () => {
    if (!assetCode) {
      notifyError('Pilih aset yang rusak.');
      return;
    }
    if (description.trim().length < 5) {
      notifyError('Deskripsi masalah minimal 5 karakter.');
      return;
    }
    if (!INCIDENT_PHOTO_KINDS.every((k) => photos[k])) {
      notifyError('Lampirkan foto barang, foto kerusakan, dan foto barang dengan stiker aset.');
      return;
    }
    let incidentId: string | null = null;
    try {
      const incident = await createIncident(api, {
        orderNumber,
        assetCode,
        urgency,
        description,
        locationNote,
      });
      incidentId = incident.id;
      for (const kind of INCIDENT_PHOTO_KINDS) {
        const file = photos[kind];
        if (file) await uploadIncidentPhoto(api, incident.id, file, kind);
      }
      await submitIncident(api, incident.id);
      notify('success', `Laporan ${incident.number} terkirim.`);
    } catch {
      if (incidentId)
        notifyError('Laporan tersimpan sebagai draft. Lengkapi dan kirim dari detail.');
    }
    if (incidentId) void navigate(`${detailBase}/${incidentId}`, { replace: true });
  };

  return (
    <>
      <Field label="Aset yang rusak">
        <SearchSelect
          value={assetCode}
          options={assets.map((a) => ({ value: a.code, label: `${a.code} · ${a.productName}` }))}
          placeholder={
            assets.length ? 'Cari / pilih aset…' : 'Tidak ada aset yang dapat dilaporkan'
          }
          disabled={assets.length === 0}
          onChange={setAssetCode}
        />
      </Field>
      <Choice label="Urgensi" value={urgency} options={URGENCY_OPTIONS} onChange={setUrgency} />
      <Field label="Deskripsi masalah">
        <textarea
          className="textarea ev-control"
          rows={4}
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field label="Catatan lokasi (opsional)">
        <input
          className="input ev-control"
          maxLength={300}
          value={locationNote}
          onChange={(e) => setLocationNote(e.target.value)}
        />
      </Field>
      <div className="ev-photo-slots">
        <Muted>
          Wajib: foto barang, foto kerusakan, dan foto barang dengan stiker aset terlihat.
        </Muted>
        {INCIDENT_PHOTO_KINDS.map((kind) => (
          <PhotoSlot
            key={kind}
            label={INCIDENT_PHOTO_LABEL[kind]}
            file={photos[kind]}
            onChange={(file) => setPhotos((prev) => ({ ...prev, [kind]: file }))}
          />
        ))}
      </div>
      <Button variant="error" className="ev-btn--block" icon={mdiSend} onClick={submit}>
        Kirim laporan
      </Button>
    </>
  );
}
