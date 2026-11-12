import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getIncident, submitIncident, uploadIncidentPhoto } from '@eventra/api-client';
import {
  INCIDENT_STATUS_BADGE,
  INCIDENT_URGENCY_BADGE,
  MAX_INCIDENT_PHOTOS,
  REPLACEMENT_STATUS_BADGE,
  SERVICE_TICKET_STATUS_BADGE,
  type Role,
} from '@eventra/shared';
import { api } from '../api';
import { useAsync } from '../hooks';
import { formatDateTime } from '../lib/format';
import {
  DECISION_LABEL,
  INCIDENT_STATUS_LABEL,
  REPLACEMENT_STATUS_LABEL,
  SERVICE_TICKET_STATUS_LABEL,
  URGENCY_LABEL,
} from '../lib/labels';
import type { Route } from '../lib/navigation';
import type { PickedPhoto } from '../lib/photos';
import { mobileAccess } from '../lib/tasks';
import { notify, notifyError } from '../lib/toast';
import { PhotoPicker } from '../PhotoPicker';
import { Badge, Button, Card, ErrorState, Loading, Muted, Row, Screen, Section } from '../ui';
import { colors, spacing } from '../theme';

interface Props {
  id: string;
  role: Role;
  onBack: () => void;
  onOpen: (route: Route) => void;
}

export function IncidentScreen({ id, role, onBack, onOpen }: Props) {
  const access = mobileAccess(role);
  const { data, error, loading, reload, setData } = useAsync(() => getIncident(api, id), id);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);

  if (data === null) {
    return (
      <Screen title="Insiden" onBack={onBack}>
        {loading ? <Loading /> : <ErrorState message={error ?? 'Gagal memuat'} onRetry={reload} />}
      </Screen>
    );
  }

  const incident = data;
  const isDraft = incident.status === 'DRAFT' && access.reportIncident;
  const room = MAX_INCIDENT_PHOTOS - incident.photoIds.length;

  const sendDraft = async () => {
    if (incident.photoIds.length + photos.length < 1) {
      notifyError('Lampirkan minimal 1 foto sebelum mengirim.');
      return;
    }
    const remaining = [...photos];
    try {
      for (const photo of photos) {
        setData(
          await uploadIncidentPhoto(api, incident.id, { data: photo.data, type: photo.mimeType }),
        );
        remaining.shift();
      }
      setData(await submitIncident(api, incident.id));
      notify('success', `Laporan ${incident.number} terkirim.`);
      setPhotos([]);
    } finally {
      // Foto yang sudah terunggah tidak diunggah dua kali saat mencoba lagi.
      setPhotos(remaining);
    }
  };

  return (
    <Screen title={incident.number} onBack={onBack} onRefresh={reload} refreshing={loading}>
      <Card>
        <View style={styles.badges}>
          <Badge variant={INCIDENT_STATUS_BADGE[incident.status]}>
            {INCIDENT_STATUS_LABEL[incident.status]}
          </Badge>
          <Badge variant={INCIDENT_URGENCY_BADGE[incident.urgency]}>
            {URGENCY_LABEL[incident.urgency]}
          </Badge>
        </View>
        <Row label="Aset" value={`${incident.assetCode} · ${incident.productName}`} />
        <Row label="Pesanan" value={incident.orderNumber} />
        <Row label="Lokasi" value={incident.eventLocation} />
        <Row label="Pelapor" value={incident.reporter} />
        <Row label="Foto" value={`${incident.photoIds.length}/${MAX_INCIDENT_PHOTOS}`} />
        {incident.reportedAt ? (
          <Row label="Dilaporkan" value={formatDateTime(incident.reportedAt)} />
        ) : null}
      </Card>

      <Section title="Deskripsi">
        <Card>
          <Text style={styles.body}>{incident.description}</Text>
          {incident.locationNote ? <Muted>{incident.locationNote}</Muted> : null}
        </Card>
      </Section>

      {isDraft ? (
        <Section title="Lengkapi & kirim">
          <Muted>Draft belum terkirim. Laporan wajib memuat 1–{MAX_INCIDENT_PHOTOS} foto.</Muted>
          {room > 0 ? <PhotoPicker photos={photos} onChange={setPhotos} max={room} /> : null}
          <Button variant="error" onPress={sendDraft}>
            Kirim laporan
          </Button>
        </Section>
      ) : null}

      {incident.decision ? (
        <Section title="Keputusan">
          <Card>
            <Text style={styles.strong}>{DECISION_LABEL[incident.decision]}</Text>
            {incident.decisionNote ? (
              <Text style={styles.body}>{incident.decisionNote}</Text>
            ) : null}
            {incident.technicianName ? (
              <Row label="Teknisi" value={incident.technicianName} />
            ) : null}
            {incident.reviewer ? <Row label="Ditinjau oleh" value={incident.reviewer} /> : null}
          </Card>
        </Section>
      ) : null}

      {incident.serviceTickets.length > 0 ? (
        <Section title="Tiket servis">
          {incident.serviceTickets.map((t) => (
            <Card key={t.id}>
              <Text style={styles.strong}>{t.number}</Text>
              <Badge variant={SERVICE_TICKET_STATUS_BADGE[t.status]}>
                {SERVICE_TICKET_STATUS_LABEL[t.status]}
              </Badge>
              <Muted>{t.complaint}</Muted>
              {t.vendor ? <Muted>Vendor: {t.vendor}</Muted> : null}
            </Card>
          ))}
        </Section>
      ) : null}

      {incident.replacement ? (
        <Section title="Penggantian">
          <Card
            onPress={
              access.receiveReplacement || access.scanWarehouse
                ? () => onOpen({ name: 'replacement', id: incident.replacement!.id })
                : undefined
            }
          >
            <Text style={styles.strong}>{incident.replacement.number}</Text>
            <Badge variant={REPLACEMENT_STATUS_BADGE[incident.replacement.status]}>
              {REPLACEMENT_STATUS_LABEL[incident.replacement.status]}
            </Badge>
            <Muted>
              Pengganti: {incident.replacement.replacementAsset?.code ?? 'belum dipilih'}
            </Muted>
          </Card>
        </Section>
      ) : null}

      <Section title="Riwayat">
        {incident.events.map((e) => (
          <Muted key={e.id}>
            {formatDateTime(e.createdAt)} · {INCIDENT_STATUS_LABEL[e.toStatus]}
            {e.note ? ` · ${e.note}` : ''}
          </Muted>
        ))}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  strong: { fontSize: 16, fontWeight: '700', color: colors.baseContent },
  body: { fontSize: 15, color: colors.baseContent },
});
