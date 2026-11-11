import MdiIcon from '@mdi/react';

interface IconProps {
  /** Path SVG dari `@mdi/js`, mis. `mdiHome`. */
  path: string;
  className?: string;
  /** Ukuran dalam rem; default 1.25. */
  size?: number;
  title?: string;
}

/** Satu-satunya pintu masuk ikon (Material Design Icons). */
export function Icon({ path, className, size = 1.25, title }: IconProps) {
  return <MdiIcon path={path} size={`${size}rem`} className={className} title={title} />;
}
