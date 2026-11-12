import { useState } from 'react';
import { mdiDownload, mdiFileEditOutline, mdiPrinter, mdiSignatureFreehand } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { getHandoverPdf, reviseHandoverDocument, signHandoverDocument } from '@eventra/api-client';
import { SIGNER_ROLES, type HandoverDocumentDto, type SignerRole } from '@eventra/shared';
import { api } from '@/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { SignaturePad } from '@/components/ui/SignaturePad';
import { downloadBlob } from '@/lib/download';
import { formatDateTime } from '@/lib/format';
import { notify } from '@/lib/notifications';

interface DocumentsPanelProps {
  documents: HandoverDocumentDto[];
  canSign: boolean;
  canRevise: boolean;
  onChanged: () => void;
}

type Dialog = { kind: 'sign' | 'revise'; doc: HandoverDocumentDto } | null;

/** Daftar dokumen serah-terima: unduh/cetak PDF, tanda tangan PIC, dan revisi (versi baru). */
export function DocumentsPanel({ documents, canSign, canRevise, onChanged }: DocumentsPanelProps) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<Dialog>(null);

  const fileName = (d: HandoverDocumentDto) => `${d.number}-v${d.version}.pdf`;
  const download = (d: HandoverDocumentDto) => async () => {
    try {
      downloadBlob(await getHandoverPdf(api, d.id), fileName(d));
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };
  const print = (d: HandoverDocumentDto) => async () => {
    try {
      window.open(URL.createObjectURL(await getHandoverPdf(api, d.id)), '_blank');
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  return (
    <>
      <h2 className="ev-section-title">{t('warehouse.documents.title')}</h2>
      {documents.length === 0 ? (
        <p className="ev-hint">{t('warehouse.documents.empty')}</p>
      ) : (
        <div className="ev-table-wrap">
          <table className="table">
            <thead className="ev-table__head">
              <tr>
                <th>{t('warehouse.documents.number')}</th>
                <th>{t('warehouse.documents.created')}</th>
                <th>{t('warehouse.documents.signatures')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id} className="ev-table__row">
                  <td>
                    {d.number} · v{d.version}
                    <span className="ev-table__hint">
                      {t(`warehouse.documents.types.${d.type}`)}
                    </span>
                    {d.revisionReason && <span className="ev-table__hint">{d.revisionReason}</span>}
                  </td>
                  <td>
                    {formatDateTime(d.createdAt)}
                    {d.createdBy && <span className="ev-table__hint">{d.createdBy}</span>}
                  </td>
                  <td>
                    <div className="ev-badges">
                      <Badge variant={d.isLatest ? 'success' : 'neutral'}>
                        {d.isLatest
                          ? t('warehouse.documents.latest')
                          : t('warehouse.documents.superseded')}
                      </Badge>
                      <Badge variant={d.fullySigned ? 'success' : 'warning'}>
                        {d.fullySigned
                          ? t('warehouse.documents.signedBoth')
                          : t('warehouse.documents.signedCount', { count: d.signatures.length })}
                      </Badge>
                    </div>
                    {d.signatures.map((s) => (
                      <span key={s.role} className="ev-table__hint ev-table__hint--block">
                        {s.signerName} · {formatDateTime(s.signedAt)}
                      </span>
                    ))}
                  </td>
                  <td className="ev-table__actions">
                    <div className="ev-actions">
                      <Button size="sm" variant="ghost" icon={mdiDownload} onClick={download(d)}>
                        {t('warehouse.documents.download')}
                      </Button>
                      <Button size="sm" variant="ghost" icon={mdiPrinter} onClick={print(d)}>
                        {t('warehouse.documents.print')}
                      </Button>
                      {canSign && d.isLatest && !d.fullySigned && (
                        <Button
                          size="sm"
                          variant="primary"
                          icon={mdiSignatureFreehand}
                          onClick={() => setDialog({ kind: 'sign', doc: d })}
                        >
                          {t('warehouse.documents.sign')}
                        </Button>
                      )}
                      {canRevise && d.isLatest && (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={mdiFileEditOutline}
                          onClick={() => setDialog({ kind: 'revise', doc: d })}
                        >
                          {t('warehouse.documents.revise')}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.kind === 'sign' && (
        <SignModal
          key={dialog.doc.id}
          doc={dialog.doc}
          onClose={() => setDialog(null)}
          onSigned={onChanged}
        />
      )}
      {dialog?.kind === 'revise' && (
        <ReviseModal
          key={dialog.doc.id}
          doc={dialog.doc}
          onClose={() => setDialog(null)}
          onRevised={onChanged}
        />
      )}
    </>
  );
}

function SignModal({
  doc,
  onClose,
  onSigned,
}: {
  doc: HandoverDocumentDto;
  onClose: () => void;
  onSigned: () => void;
}) {
  const { t } = useTranslation();
  const signedRoles = doc.signatures.map((s) => s.role);
  const roles = SIGNER_ROLES.filter((r) => !signedRoles.includes(r));
  const [role, setRole] = useState<SignerRole>(roles[0] ?? 'WAREHOUSE');
  const [picId, setPicId] = useState('');
  const [image, setImage] = useState<string | null>(null);

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
      await signHandoverDocument(api, doc.id, { role, picId: selected, image });
      notify('success', t('warehouse.documents.signed'));
      onSigned();
      onClose();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  return (
    <Modal open title={`${t('warehouse.documents.signTitle')} · ${doc.number}`} onClose={onClose}>
      <fieldset className="ev-form-grid">
        <FormField label={t('warehouse.documents.signerRole')}>
          <select
            className="select ev-control"
            value={role}
            onChange={(e) => setRole(e.target.value as SignerRole)}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {t(`warehouse.documents.signerRoles.${r}`)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={t('warehouse.documents.signerPic')}>
          <select
            className="select ev-control"
            value={selected}
            disabled={pics.length === 0}
            onChange={(e) => setPicId(e.target.value)}
          >
            {pics.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FormField>
        {pics.length === 0 && (
          <p className="ev-form-grid__full ev-hint">{t('warehouse.documents.noPic')}</p>
        )}
        <div className="ev-form-grid__full">
          <p className="ev-hint">{t('warehouse.documents.signHint')}</p>
          <SignaturePad onChange={setImage} />
        </div>
      </fieldset>
      <div className="modal-action">
        <Button
          variant="primary"
          icon={mdiSignatureFreehand}
          disabled={!image || !selected}
          onClick={submit}
        >
          {t('warehouse.documents.sign')}
        </Button>
      </div>
    </Modal>
  );
}

function ReviseModal({
  doc,
  onClose,
  onRevised,
}: {
  doc: HandoverDocumentDto;
  onClose: () => void;
  onRevised: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  const submit = async () => {
    try {
      await reviseHandoverDocument(api, doc.id, { reason });
      notify('success', t('warehouse.documents.revised'));
      onRevised();
      onClose();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  return (
    <Modal open title={`${t('warehouse.documents.reviseTitle')} · ${doc.number}`} onClose={onClose}>
      <p className="ev-hint">{t('warehouse.documents.reviseHint')}</p>
      <FormField label={t('warehouse.documents.reason')}>
        <textarea
          className="textarea ev-control"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </FormField>
      <div className="modal-action">
        <Button
          variant="primary"
          icon={mdiFileEditOutline}
          disabled={reason.trim().length < 3}
          onClick={submit}
        >
          {t('warehouse.documents.revise')}
        </Button>
      </div>
    </Modal>
  );
}
