import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { createIncident, submitIncident, uploadIncidentPhoto } from '@eventra/api-client';
import {
  INCIDENT_URGENCIES,
  MAX_INCIDENT_PHOTOS,
  incidentCreateSchema,
  type IncidentUrgency,
} from '@eventra/shared';
import { api } from '../api';
import { URGENCY_LABEL } from '../lib/labels';
import type { PickedPhoto } from '../lib/photos';
import { notify, notifyError } from '../lib/toast';
import { PhotoPicker } from '../PhotoPicker';
import { Scanner, type ScanValue } from '../Scanner';
import { Button, Card, Choice, Field, Muted, Screen, Section } from '../ui';
import { colors } from '../theme';

const URGENCY_OPTIONS = INCIDENT_URGENCIES.map((value) => ({
  value,
  label: URGENCY_LABEL[value],
}));

interface Props {
  onBack: () => void;
  /** Setelah laporan dibuat (terkirim atau tetap draft) buka detailnya. */
  onCreated: (incidentId: string) => void;
}

export function IncidentNewScreen({ onBack, onCreated }: Props) {
  const [scanning, setScanning] = useState(false);
  const [asset, setAsset] = useState<ScanValue | null>(null);
  const [urgency, setUrgency] = useState<IncidentUrgency>('MEDIUM');
  const [description, setDescription] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);

  const submit = async () => {
    if (!asset) {
      notifyError('Pindai QR aset yang rusak terlebih dahulu.');
      return;
    }
    const parsed = incidentCreateSchema.safeParse({
      ...asset,
      urgency,
      description,
      locationNote,
    });
    if (!parsed.success) {
      notifyError('Deskripsi masalah minimal 5 karakter.');
      return;
    }
    if (photos.length < 1) {
      notifyError('Lampirkan minimal 1 foto (maksimal 5).');
      return;
    }

    const incident = await createIncident(api, parsed.data);
    try {
      for (const photo of photos) {
        await uploadIncidentPhoto(api, incident.id, { data: photo.data, type: photo.mimeType });
      }
      await submitIncident(api, incident.id);
      notify('success', `Laporan ${incident.number} terkirim.`);
    } catch {
      // Draft sudah ada di server: buka detailnya agar foto/pengiriman bisa dilanjutkan.
      notifyError('Laporan tersimpan sebagai draft. Lengkapi dan kirim dari detail laporan.');
    }
    onCreated(incident.id);
  };

  return (
    <Screen title="Lapor kerusakan" onBack={onBack}>
      <Section title="1. Aset">
        <Card>
          <Text style={asset ? styles.ok : styles.pending}>
            {asset
              ? asset.assetCode
                ? `Kode aset: ${asset.assetCode}`
                : 'QR aset terpindai'
              : 'Belum ada aset dipilih'}
          </Text>
          <Button variant="outline" onPress={() => setScanning(true)}>
            {asset ? 'Pindai ulang' : 'Pindai QR aset'}
          </Button>
        </Card>
      </Section>

      <Section title="2. Masalah">
        <Choice label="Urgensi" value={urgency} options={URGENCY_OPTIONS} onChange={setUrgency} />
        <Field
          label="Deskripsi masalah"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={2000}
        />
        <Field
          label="Catatan lokasi (opsional)"
          value={locationNote}
          onChangeText={setLocationNote}
          maxLength={300}
        />
      </Section>

      <Section title={`3. Foto (1–${MAX_INCIDENT_PHOTOS})`}>
        <PhotoPicker photos={photos} onChange={setPhotos} />
      </Section>

      <Muted>Aset hanya dapat dilaporkan oleh PIC lapangan yang ditugaskan pada pesanannya.</Muted>
      <Button variant="error" onPress={submit}>
        Kirim laporan
      </Button>

      <Scanner
        visible={scanning}
        title="Pindai QR aset rusak"
        allowManual
        closeOnSuccess
        onScan={async (value) => {
          setAsset(value);
          return 'Aset dipilih';
        }}
        onClose={() => setScanning(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  ok: { color: colors.success, fontWeight: '700', fontSize: 15 },
  pending: { color: colors.muted, fontSize: 15 },
});
