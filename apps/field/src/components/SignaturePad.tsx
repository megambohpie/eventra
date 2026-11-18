import { useRef, type PointerEvent } from 'react';
import { mdiEraser } from '@mdi/js';
import { Button } from './Button';

interface SignaturePadProps {
  /** PNG data URL bila sudah ada goresan, `null` setelah dikosongkan. */
  onChange: (dataUrl: string | null) => void;
}

const WIDTH = 600;
const HEIGHT = 220;

/** Kotak tanda tangan (canvas): digambar dengan jari/stylus, hasilnya PNG data URL. */
export function SignaturePad({ onChange }: SignaturePadProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    };
  };

  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    const ctx = event.currentTarget.getContext('2d');
    if (!ctx) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = point(event);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.01, y + 0.01);
    ctx.stroke();
  };

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = event.currentTarget.getContext('2d');
    if (!ctx) return;
    const { x, y } = point(event);
    ctx.lineTo(x, y);
    ctx.stroke();
    dirty.current = true;
  };

  const end = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(dirty.current ? event.currentTarget.toDataURL('image/png') : null);
  };

  const clear = () => {
    canvas.current?.getContext('2d')?.clearRect(0, 0, WIDTH, HEIGHT);
    dirty.current = false;
    onChange(null);
  };

  return (
    <div className="ev-signature">
      <canvas
        ref={canvas}
        className="ev-signature__canvas"
        width={WIDTH}
        height={HEIGHT}
        aria-label="Area tanda tangan"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      <Button size="sm" variant="ghost" icon={mdiEraser} onClick={clear}>
        Hapus
      </Button>
    </div>
  );
}
