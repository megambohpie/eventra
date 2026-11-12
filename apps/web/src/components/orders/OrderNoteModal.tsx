import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';

interface OrderNoteModalProps {
  title: string;
  confirmLabel: string;
  /** Bila diberikan, dialog meminta lama hold (menit) alih-alih catatan. */
  holdMinutes?: number;
  onConfirm: (input: { note: string; holdMinutes?: number }) => Promise<void>;
  onClose: () => void;
}

/** Dialog aksi pesanan dengan catatan opsional (tolak/batal/penawaran) atau lama hold. */
export function OrderNoteModal({
  title,
  confirmLabel,
  holdMinutes,
  onConfirm,
  onClose,
}: OrderNoteModalProps) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [minutes, setMinutes] = useState(String(holdMinutes ?? ''));

  return (
    <Modal open title={title} onClose={onClose}>
      {holdMinutes !== undefined ? (
        <FormField label={t('orders.holdMinutes')}>
          <input
            type="number"
            className="input ev-control"
            min={5}
            max={1440}
            step={1}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </FormField>
      ) : (
        <FormField label={t('common.note')}>
          <textarea
            className="textarea ev-control"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>
      )}
      <div className="modal-action">
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          onClick={async () => {
            await onConfirm({
              note,
              ...(holdMinutes !== undefined ? { holdMinutes: Number(minutes) } : {}),
            });
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
