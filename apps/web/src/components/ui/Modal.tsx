import type { ReactNode } from 'react';
import { mdiClose } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Lebar besar untuk form dengan banyak kolom/tabel. */
  wide?: boolean;
  /** Panel yang menggeser masuk dari sisi kanan layar (daftar panjang). */
  side?: boolean;
  children: ReactNode;
}

/** Dialog DaisyUI standar; isi dirender hanya saat terbuka sehingga state form selalu segar. */
export function Modal({ open, title, onClose, wide = false, side = false, children }: ModalProps) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <dialog
      className={`modal modal-open${side ? ' modal-end' : ''}`}
      aria-label={title}
      onCancel={onClose}
    >
      <div
        className={`modal-box ${wide ? 'ev-modal__box--wide' : ''} ${side ? 'ev-modal__box--side' : ''}`.trim()}
      >
        <div className="ev-modal__head">
          <h2 className="ev-modal__title">{title}</h2>
          <Button
            variant="ghost"
            size="sm"
            icon={mdiClose}
            aria-label={t('common.close')}
            onClick={onClose}
          />
        </div>
        {children}
      </div>
      <div className="modal-backdrop" aria-hidden onClick={onClose} />
    </dialog>
  );
}
