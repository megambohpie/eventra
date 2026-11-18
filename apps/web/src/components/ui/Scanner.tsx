import { useEffect, useRef, useState } from 'react';
import { mdiSend } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { createScanGate, parseAssetCode, parseQrToken } from '@/lib/qr';
import { Button } from './Button';
import { Modal } from './Modal';

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
  /** Kode aset yang diketik hanya untuk pengguna yang berhak (API tetap menegakkan hak akses). */
  allowManual?: boolean;
}

interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
}
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

const detectorCtor = (): BarcodeDetectorCtor | null =>
  (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null;

/** Pemindai QR kamera (BarcodeDetector) dengan input ketik sebagai cadangan. */
export function Scanner({ open, title, onScan, onClose, allowManual }: ScannerProps) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const busy = useRef(false);
  const gate = useRef(createScanGate(2000));
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [manual, setManual] = useState('');
  const [denied, setDenied] = useState(false);
  const supported = detectorCtor() !== null && Boolean(navigator.mediaDevices?.getUserMedia);
  const cameraNote = !supported ? t('scanner.unsupported') : denied ? t('scanner.denied') : null;
  const handler = useRef(onScan);
  useEffect(() => {
    handler.current = onScan;
  });

  const submit = async (value: ScanValue) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const text = await handler.current(value);
      setFeedback({ ok: true, text: text || t('scanner.ok') });
    } catch (e) {
      setFeedback({ ok: false, text: e instanceof Error ? e.message : String(e) });
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
          s.getTracks().forEach((track) => track.stop());
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
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open]);

  const sendManual = async () => {
    const token = parseQrToken(manual);
    const code = parseAssetCode(manual);
    if (allowManual && code?.startsWith('AST-')) await submit({ assetCode: code });
    else if (token) await submit({ qrToken: token });
    else if (allowManual && code) await submit({ assetCode: code });
    else setFeedback({ ok: false, text: t('scanner.invalid') });
    setManual('');
  };

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="ev-scanner">
        {cameraNote ? (
          <p className="ev-hint">{cameraNote}</p>
        ) : (
          <video ref={video} className="ev-scanner__video" muted playsInline />
        )}
        {feedback && (
          <div
            role="status"
            className={`alert ${feedback.ok ? 'alert-success' : 'alert-error'} ev-scanner__feedback`}
          >
            <span>{feedback.text}</span>
          </div>
        )}
        <div className="ev-scanner__manual">
          <input
            className="input ev-control"
            autoComplete="off"
            autoCapitalize="characters"
            placeholder={allowManual ? t('scanner.placeholderManual') : t('scanner.placeholder')}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void sendManual();
            }}
          />
          <Button
            icon={mdiSend}
            aria-label={t('scanner.send')}
            disabled={!manual.trim()}
            onClick={sendManual}
          />
        </div>
      </div>
    </Modal>
  );
}
