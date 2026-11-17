import { useEffect, useRef, useState } from 'react';
import { mdiClose, mdiSend } from '@mdi/js';
import { errorMessage } from '@/lib/errors';
import { createScanGate, parseAssetCode, parseQrToken } from '@/lib/qr';
import { Button } from './Button';
import { Muted } from './ui';

export type ScanValue =
  { qrToken: string; assetCode?: undefined } | { assetCode: string; qrToken?: undefined };

interface ScannerProps {
  open: boolean;
  title: string;
  /**
   * Dipanggil untuk setiap QR/kode yang terbaca. Kembalikan teks sukses; lempar error bila ditolak.
   * Pemindai tetap terbuka agar banyak aset dapat dipindai berurutan.
   */
  onScan: (value: ScanValue) => Promise<string | void>;
  onClose: () => void;
  /** Kode aset yang diketik hanya untuk aksi yang mengizinkannya (API tetap menegakkan hak akses). */
  allowManual?: boolean;
  /** Tutup otomatis setelah satu scan berhasil. */
  closeOnSuccess?: boolean;
}

interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
}
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

const detectorCtor = (): BarcodeDetectorCtor | null =>
  (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null;

/** Pemindai QR di browser ponsel (kamera belakang, BarcodeDetector) dengan input ketik sebagai cadangan. */
export function Scanner({
  open,
  title,
  onScan,
  onClose,
  allowManual,
  closeOnSuccess,
}: ScannerProps) {
  const video = useRef<HTMLVideoElement>(null);
  const busy = useRef(false);
  const gate = useRef(createScanGate(2000));
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [manual, setManual] = useState('');
  const [denied, setDenied] = useState(false);
  const supported = detectorCtor() !== null && Boolean(navigator.mediaDevices?.getUserMedia);
  const cameraNote = !supported
    ? 'Kamera tidak tersedia di browser ini. Ketik kode di bawah.'
    : denied
      ? 'Izin kamera ditolak atau kamera tidak tersedia. Ketik kode di bawah.'
      : null;
  const handler = useRef(onScan);
  const closer = useRef(onClose);
  useEffect(() => {
    handler.current = onScan;
    closer.current = onClose;
  });

  const submit = async (value: ScanValue) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const text = await handler.current(value);
      if (closeOnSuccess) {
        setFeedback(null);
        closer.current();
      } else {
        setFeedback({ ok: true, text: text || 'Berhasil' });
      }
    } catch (e) {
      setFeedback({ ok: false, text: errorMessage(e) });
    } finally {
      busy.current = false;
    }
  };
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    const Detector = detectorCtor();
    if (!Detector || !navigator.mediaDevices?.getUserMedia) return;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const el = video.current;
        if (el) {
          el.srcObject = s;
          void el.play();
        }
        const detector = new Detector({ formats: ['qr_code'] });
        timer = setInterval(() => {
          const v = video.current;
          if (!v || v.readyState < 2) return;
          detector
            .detect(v)
            .then((codes) => {
              const raw = codes[0]?.rawValue;
              if (!raw) return;
              const token = parseQrToken(raw);
              if (token && gate.current(token)) void submitRef.current({ qrToken: token });
            })
            .catch(() => undefined);
        }, 350);
      })
      .catch(() => setDenied(true));
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  if (!open) return null;

  const sendManual = async () => {
    const token = parseQrToken(manual);
    const code = parseAssetCode(manual);
    if (allowManual && code?.startsWith('AST-')) await submit({ assetCode: code });
    else if (token) await submit({ qrToken: token });
    else if (allowManual && code) await submit({ assetCode: code });
    else setFeedback({ ok: false, text: 'Kode tidak valid.' });
    setManual('');
  };

  return (
    <dialog className="modal modal-open ev-modal" open>
      <div className="modal-box ev-modal__box ev-scanner">
        <div className="ev-scanner__head">
          <h3 className="ev-modal__title">{title}</h3>
          <Button variant="ghost" size="sm" icon={mdiClose} aria-label="Tutup" onClick={onClose} />
        </div>
        {cameraNote ? (
          <Muted>{cameraNote}</Muted>
        ) : (
          <video ref={video} className="ev-scanner__video" muted playsInline />
        )}
        {feedback && (
          <p className="ev-scanner__feedback" data-ok={feedback.ok} role="status">
            {feedback.text}
          </p>
        )}
        <div className="ev-scanner__manual">
          <input
            className="input ev-control"
            autoComplete="off"
            autoCapitalize="characters"
            placeholder={allowManual ? 'Ketik kode aset (AST-…) atau token QR' : 'Tempel token QR'}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void sendManual();
            }}
          />
          <Button
            icon={mdiSend}
            aria-label="Kirim"
            disabled={!manual.trim()}
            onClick={sendManual}
          />
        </div>
      </div>
    </dialog>
  );
}
