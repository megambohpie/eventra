import { useEffect, useState } from 'react';
import { mdiSend } from '@mdi/js';
import { useParams } from 'react-router-dom';
import {
  getIncident,
  getIncidentPhoto,
  submitIncident,
  uploadIncidentPhoto,
} from '@eventra/api-client';
import {
  INCIDENT_PHOTO_KINDS,
  INCIDENT_STATUS_BADGE,
  INCIDENT_URGENCY_BADGE,
  REPLACEMENT_STATUS_BADGE,
  SERVICE_TICKET_STATUS_BADGE,
  type IncidentPhotoKind,
} from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { PhotoSlot } from '@/components/PhotoSlot';
import { Card, ErrorState, Loading, Muted, Row, Screen, Section, Strong } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { formatDateTime } from '@/lib/format';
import {
  DECISION_LABEL,
  INCIDENT_PHOTO_LABEL,
  INCIDENT_STATUS_LABEL,
  REPLACEMENT_STATUS_LABEL,
  SERVICE_TICKET_STATUS_LABEL,
  URGENCY_LABEL,
} from '@/lib/labels';
import { notify, notifyError } from '@/lib/notifications';
import { fieldAccess } from '@/lib/tasks';

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
      <img className="ev-thumb" src={src} alt="" />
    </a>
  ) : (
    <span className="ev-thumb skeleton" />
  );
}

export function IncidentDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const access = fieldAccess(user?.role ?? 'CUSTOMER');
  const { data, error, loading, reload, setData } = useAsync(() => getIncident(api, id), id);
  const [added, setAdded] = useState<Partial<Record<IncidentPhotoKind, File>>>({});

  if (data === null) {
    return (
      <Screen title="Insiden" back>
        {loading ? <Loading /> : <ErrorState message={error ?? 'Gagal memuat'} onRetry={reload} />}
      </Screen>
    );
  }

  const incident = data;
  const isDraft = incident.status === 'DRAFT' && access.reportIncident;
  const missing = INCIDENT_PHOTO_KINDS.filter((k) => !incident.photos.some((p) => p.kind === k));

  const sendDraft = async () => {
    if (missing.some((k) => !added[k])) {
      notifyError('Lampirkan foto barang, foto kerusakan, dan foto barang dengan stiker aset.');
      return;
    }
    for (const kind of missing) {
      const file = added[kind];
      if (!file) continue;
      setData(await uploadIncidentPhoto(api, incident.id, file, kind));
      setAdded((prev) => ({ ...prev, [kind]: undefined }));
    }
    setData(await submitIncident(api, incident.id));
    notify('success', `Laporan ${incident.number} terkirim.`);
  };

  return (
    <Screen title={incident.number} back onRefresh={reload}>
      <Card>
        <div className="ev-badges">
          <Badge variant={INCIDENT_STATUS_BADGE[incident.status]}>
            {INCIDENT_STATUS_LABEL[incident.status]}
          </Badge>
          <Badge variant={INCIDENT_URGENCY_BADGE[incident.urgency]}>
            {URGENCY_LABEL[incident.urgency]}
          </Badge>
        </div>
        <Row label="Aset" value={`${incident.assetCode} · ${incident.productName}`} />
        <Row label="Pesanan" value={incident.orderNumber} />
        <Row label="Lokasi" value={incident.eventLocation} />
        <Row label="Pelapor" value={incident.reporter} />
        {incident.reportedAt && (
          <Row label="Dilaporkan" value={formatDateTime(incident.reportedAt)} />
        )}
      </Card>

      <Section title="Deskripsi">
        <Card>
          <p>{incident.description}</p>
          {incident.locationNote && <Muted>{incident.locationNote}</Muted>}
        </Card>
      </Section>

      <Section title="Foto">
        {INCIDENT_PHOTO_KINDS.map((kind) => {
          const own = incident.photos.filter((p) => p.kind === kind);
          if (own.length === 0 && isDraft) return null;
          return (
            <Card key={kind}>
              <Strong>{INCIDENT_PHOTO_LABEL[kind]}</Strong>
              <div className="ev-thumbs">
                {own.map((p) => (
                  <PhotoThumb key={p.id} incidentId={incident.id} photoId={p.id} />
                ))}
                {own.length === 0 && <Muted>Tidak ada foto.</Muted>}
              </div>
            </Card>
          );
        })}
      </Section>

      {isDraft && (
        <Section title="Lengkapi & kirim">
          <Muted>Draft belum terkirim. Lengkapi foto yang masih kurang, lalu kirim.</Muted>
          {missing.map((kind) => (
            <PhotoSlot
              key={kind}
              label={INCIDENT_PHOTO_LABEL[kind]}
              file={added[kind]}
              onChange={(file) => setAdded((prev) => ({ ...prev, [kind]: file }))}
            />
          ))}
          <Button variant="error" className="ev-btn--block" icon={mdiSend} onClick={sendDraft}>
            Kirim laporan
          </Button>
        </Section>
      )}

      {incident.decision && (
        <Section title="Keputusan">
          <Card>
            <Strong>{DECISION_LABEL[incident.decision]}</Strong>
            {incident.decisionNote && <p>{incident.decisionNote}</p>}
            {incident.technicianName && <Row label="Teknisi" value={incident.technicianName} />}
            {incident.reviewer && <Row label="Ditinjau oleh" value={incident.reviewer} />}
          </Card>
        </Section>
      )}

      {incident.serviceTickets.length > 0 && (
        <Section title="Tiket servis">
          {incident.serviceTickets.map((t) => (
            <Card key={t.id}>
              <Strong>{t.number}</Strong>
              <div>
                <Badge variant={SERVICE_TICKET_STATUS_BADGE[t.status]}>
                  {SERVICE_TICKET_STATUS_LABEL[t.status]}
                </Badge>
              </div>
              <Muted>{t.complaint}</Muted>
              {t.vendor && <Muted>Vendor: {t.vendor}</Muted>}
            </Card>
          ))}
        </Section>
      )}

      {incident.replacement && (
        <Section title="Penggantian">
          <Card
            to={
              access.receiveReplacement || access.scanWarehouse
                ? `/replacements/${incident.replacement.id}`
                : undefined
            }
          >
            <Strong>{incident.replacement.number}</Strong>
            <div>
              <Badge variant={REPLACEMENT_STATUS_BADGE[incident.replacement.status]}>
                {REPLACEMENT_STATUS_LABEL[incident.replacement.status]}
              </Badge>
            </div>
            <Muted>
              Pengganti: {incident.replacement.replacementAsset?.code ?? 'belum dipilih'}
            </Muted>
          </Card>
        </Section>
      )}

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
