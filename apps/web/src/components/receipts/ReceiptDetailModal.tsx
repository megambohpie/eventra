import { useState } from 'react';
import { mdiCancel, mdiCheckCircle, mdiFileDocumentOutline, mdiPencil } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { cancelReceipt, getAssetLabelsPdf, getReceipt, receiveReceipt } from '@eventra/api-client';
import { MAX_LABELS, type ReceiptDto } from '@eventra/shared';
import { api } from '@/api';
import { Button } from '@/components/ui/Button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { useResource } from '@/hooks/useResource';
import { downloadBlob } from '@/lib/download';
import { formatDate, formatDateTime, formatRupiah } from '@/lib/format';
import { notify } from '@/lib/notifications';
import { ReceiptStatusBadge } from './ReceiptStatusBadge';

interface ReceiptDetailModalProps {
  receiptId: string;
  canWrite: boolean;
  canSeeCost: boolean;
  onEdit: (receipt: ReceiptDto) => void;
  onClose: () => void;
  onChanged: () => void;
}

type Confirm = 'receive' | 'cancel' | null;

export function ReceiptDetailModal({
  receiptId,
  canWrite,
  canSeeCost,
  onEdit,
  onClose,
  onChanged,
}: ReceiptDetailModalProps) {
  const { t } = useTranslation();
  const { data, loading, reload } = useResource(() => getReceipt(api, receiptId), receiptId);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const receive = async () => {
    try {
      const done = await receiveReceipt(api, receiptId);
      notify('success', t('receipts.received', { count: done.assetIds?.length ?? 0 }));
      setConfirm(null);
      reload();
      onChanged();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  const cancel = async () => {
    try {
      await cancelReceipt(api, receiptId);
      notify('success', t('receipts.cancelled'));
      setConfirm(null);
      reload();
      onChanged();
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  /** Label dicetak per 100 aset (batas API); beberapa PDF bila penerimaan lebih besar. */
  const printLabels = async () => {
    const ids = data?.assetIds ?? [];
    try {
      for (let i = 0; i < ids.length; i += MAX_LABELS) {
        const blob = await getAssetLabelsPdf(api, ids.slice(i, i + MAX_LABELS));
        downloadBlob(blob, `${data?.number ?? 'receipt'}-labels-${i / MAX_LABELS + 1}.pdf`);
      }
      notify('success', t('receipts.labelsDownloaded'));
    } catch {
      /* error sudah tampil sebagai notifikasi */
    }
  };

  const r = data;
  const info: [string, string][] = r
    ? [
        [t('receipts.source'), t(`receipts.sources.${r.source}`)],
        [t('receipts.sourceRef'), r.sourceRef ?? '-'],
        [t('receipts.supplier'), r.supplier ?? '-'],
        [t('receipts.location'), r.locationName],
        [t('receipts.receivedDate'), formatDate(r.receivedDate)],
        [
          t('receipts.receivedBy'),
          r.receivedBy && r.receivedAt ? `${r.receivedBy} · ${formatDateTime(r.receivedAt)}` : '-',
        ],
        [t('receipts.note'), r.note ?? '-'],
      ]
    : [];

  return (
    <>
      <Modal open title={r?.number ?? t('receipts.title')} onClose={onClose} wide>
        {loading && !r ? (
          <Loading />
        ) : (
          r && (
            <>
              <div className="ev-detail__badges">
                <ReceiptStatusBadge status={r.status} />
              </div>
              <dl className="ev-dl">
                {info.map(([label, value]) => (
                  <div key={label} className="ev-dl__row">
                    <dt className="ev-dl__term">{label}</dt>
                    <dd className="ev-dl__desc">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="ev-table-wrap">
                <table className="table">
                  <thead className="ev-table__head">
                    <tr>
                      <th>{t('receipts.product')}</th>
                      <th>{t('receipts.quantity')}</th>
                      <th>{t('receipts.condition')}</th>
                      {canSeeCost && <th>{t('receipts.unitCost')}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {r.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.productName}
                          {item.serials.length > 0 && (
                            <span className="ev-table__hint">{item.serials.join(', ')}</span>
                          )}
                        </td>
                        <td>{item.quantity}</td>
                        <td>{t(`assets.conditions.${item.condition}`)}</td>
                        {canSeeCost && (
                          <td>
                            {item.unitCost === null || item.unitCost === undefined
                              ? '-'
                              : formatRupiah(item.unitCost)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {r.status === 'RECEIVED' && (
                <p className="ev-table__hint">
                  {t('receipts.createdAssets')}: {r.assetIds?.length ?? 0}
                </p>
              )}
              <div className="modal-action">
                {r.status === 'RECEIVED' && (
                  <Button variant="secondary" icon={mdiFileDocumentOutline} onClick={printLabels}>
                    {t('receipts.printLabels')}
                  </Button>
                )}
                {canWrite && r.status === 'DRAFT' && (
                  <>
                    <Button variant="ghost" icon={mdiCancel} onClick={() => setConfirm('cancel')}>
                      {t('receipts.cancelReceipt')}
                    </Button>
                    <Button variant="secondary" icon={mdiPencil} onClick={() => onEdit(r)}>
                      {t('receipts.edit')}
                    </Button>
                    <Button
                      variant="primary"
                      icon={mdiCheckCircle}
                      onClick={() => setConfirm('receive')}
                    >
                      {t('receipts.receive')}
                    </Button>
                  </>
                )}
              </div>
            </>
          )
        )}
      </Modal>
      {confirm === 'receive' && (
        <ConfirmModal
          title={t('receipts.receiveTitle')}
          message={t('receipts.receiveMessage')}
          confirmLabel={t('receipts.receive')}
          onConfirm={receive}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === 'cancel' && (
        <ConfirmModal
          title={t('receipts.cancelTitle')}
          message={t('receipts.cancelMessage')}
          confirmLabel={t('receipts.cancelReceipt')}
          onConfirm={cancel}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}
