import { requestOldAssetReturn } from '@eventra/api-client';
import type { ReplacementTaskDto } from '@eventra/shared';
import { api } from '@/api';
import { Button } from '@/components/Button';
import { Muted } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { formatDateTime } from '@/lib/format';
import { notify } from '@/lib/notifications';

interface Props {
  task: ReplacementTaskDto;
  onChanged: () => void;
}

/**
 * Penyewa/PIC menyerahkan aset rusak setelah pengganti diterima (mis. dibawa staf pengantar). Gudang
 * kemudian cukup menerimanya lewat scan; bila tidak diserahkan, aset ikut pengembalian pesanan.
 */
export function OldAssetHandover({ task, onChanged }: Props) {
  const back = task.oldAssetReturn;
  if (task.status !== 'RECEIVED') return null;

  if (back.returnedAt) {
    return <Muted>Aset rusak sudah diterima gudang {formatDateTime(back.returnedAt)}.</Muted>;
  }
  if (back.requestedAt) {
    return (
      <Muted>
        Aset rusak {task.oldAsset.code} sudah Anda serahkan {formatDateTime(back.requestedAt)}.
        Menunggu gudang menerimanya.
      </Muted>
    );
  }

  const handOver = async () => {
    const ok = await confirm(
      `Serahkan aset rusak ${task.oldAsset.code}?`,
      'Berikan aset ini kepada staf pengantar. Gudang akan menerimanya; Anda tidak perlu menunggu sewa selesai.',
      'Serahkan',
    );
    if (!ok) return;
    await requestOldAssetReturn(api, task.id);
    notify('success', 'Aset rusak diserahkan. Menunggu gudang menerima.');
    onChanged();
  };

  return (
    <>
      <Muted>
        Aset rusak {task.oldAsset.code} boleh diserahkan sekarang kepada staf pengantar, atau
        dibiarkan dan dikembalikan bersama barang pesanan saat sewa selesai.
      </Muted>
      <Button variant="outline" className="ev-btn--block" onClick={handOver}>
        Serahkan aset rusak
      </Button>
    </>
  );
}
