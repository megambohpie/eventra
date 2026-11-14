import { AssetDetailView } from '@/components/assets/AssetDetailView';
import { Modal } from '@/components/ui/Modal';

interface AssetDetailDialogProps {
  id: string;
  code: string;
  onClose: () => void;
  onChanged?: () => void;
}

/** Detail aset sebagai dialog, agar tidak terkesan pindah halaman. */
export function AssetDetailDialog({ id, code, onClose, onChanged }: AssetDetailDialogProps) {
  return (
    <Modal open wide title={code} onClose={onClose}>
      <AssetDetailView id={id} embedded onChanged={onChanged} />
    </Modal>
  );
}
