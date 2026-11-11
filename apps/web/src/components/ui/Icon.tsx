import type { ComponentType } from 'react';
import * as Mdi from '@mdi/react';

interface IconProps {
  /** Path SVG dari `@mdi/js`, mis. `mdiHome`. */
  path: string;
  className?: string;
  /** Ukuran dalam rem; default 1.25. */
  size?: number;
  title?: string;
}

type MdiComponent = ComponentType<{
  path: string;
  size?: string;
  className?: string;
  title?: string;
}>;

// @mdi/react adalah bundle CJS (exports.default + exports.Icon). Bergantung pada bundler (Vite dev vs
// build vs Vitest), impor default bisa berupa komponen atau objek namespace, jadi pilih komponen valid.
const isComponent = (value: unknown): value is MdiComponent =>
  typeof value === 'function' ||
  (typeof value === 'object' && value !== null && '$$typeof' in value);

function resolveMdiIcon(): MdiComponent {
  const ns = Mdi as unknown as Record<string, unknown> & { default?: Record<string, unknown> };
  const candidates = [ns.Icon, ns.default?.Icon, ns.default?.default, ns.default];
  const found = candidates.find(isComponent);
  if (!found) throw new Error('Komponen Icon dari @mdi/react tidak ditemukan');
  return found;
}

const MdiIcon = resolveMdiIcon();

/** Satu-satunya pintu masuk ikon (Material Design Icons). */
export function Icon({ path, className, size = 1.25, title }: IconProps) {
  return <MdiIcon path={path} size={`${size}rem`} className={className} title={title} />;
}
