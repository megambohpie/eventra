import { useState } from 'react';
import { receiveReplacement } from '@eventra/api-client';
import { ASSET_CONDITIONS, type AssetCondition } from '@eventra/shared';
import { api } from '@/api';
import { Button } from '@/components/Button';
import { Scanner, type ScanValue } from '@/components/Scanner';
import { Choice, Field, Muted } from '@/components/ui';
import { CONDITION_LABEL } from '@/lib/labels';
import { notify } from '@/lib/notifications';

const CONDITION_OPTIONS = ASSET_CONDITIONS.map((value) => ({
  value,
  label: CONDITION_LABEL[value],
}));

interface Props {
  taskId: string;
  /** Kode aset pengganti yang sedang dalam perjalanan; hanya aset ini yang diterima server. */
  assetCode: string | null;
  /** Ketik kode aset (hanya Owner/Admin); selain itu wajib QR. */
  allowManual?: boolean;
  onReceived: () => void;
}

/** Terima aset pengganti yang dalam perjalanan: periksa kondisi lalu scan QR aset yang sama. */
export function ReplacementReceive({ taskId, assetCode, allowManual = false, onReceived }: Props) {
  const [open, setOpen] = useState(false);
  const [condition, setCondition] = useState<AssetCondition>('GOOD');
  const [note, setNote] = useState('');

  const onScan = async (value: ScanValue): Promise<string> => {
    await receiveReplacement(api, taskId, {
      ...value,
      condition,
      note: note.trim() || undefined,
    });
    notify('success', 'Aset pengganti diterima.');
    onReceived();
    return 'Diterima';
  };

  return (
    <>
      <Muted>
        Periksa fisik aset, pilih kondisinya, lalu scan QR aset pengganti
        {assetCode ? ` (${assetCode})` : ''}.
      </Muted>
      <Choice
        label="Kondisi saat diterima"
        value={condition}
        options={CONDITION_OPTIONS}
        onChange={setCondition}
      />
      <Field label="Catatan (opsional)">
        <input
          className="input ev-control"
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <Button className="ev-btn--block" onClick={() => setOpen(true)}>
        Scan & terima
      </Button>
      <Scanner
        open={open}
        title="Scan QR aset pengganti"
        allowManual={allowManual}
        closeOnSuccess
        onScan={onScan}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
