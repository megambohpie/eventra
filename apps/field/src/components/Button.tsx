import { useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { Icon } from './Icon';

const VARIANTS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  accent: 'btn-accent',
  neutral: 'btn-neutral',
  ghost: 'btn-ghost',
  error: 'btn-error',
  success: 'btn-success',
} as const;

const SIZES = { xs: 'btn-xs', sm: 'btn-sm', md: '', lg: 'btn-lg' } as const;

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  /** Paksa status loading dari luar. */
  loading?: boolean;
  /** MDI icon path di sisi kiri teks. */
  icon?: string;
  /** Bila handler mengembalikan Promise, loading otomatis aktif sampai selesai. */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void | Promise<void>;
  children?: ReactNode;
}

/**
 * Tombol standar untuk semua aksi. Selama loading: spinner tampil dan tombol nonaktif,
 * sehingga tidak bisa ditekan dua kali. Handler async wajib menangani error-nya sendiri.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  onClick,
  disabled,
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const [pending, setPending] = useState(false);
  const busy = loading || pending;

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const result = onClick?.(event);
    if (result instanceof Promise) {
      setPending(true);
      const done = () => setPending(false);
      void result.then(done, (error: unknown) => {
        done();
        throw error;
      });
    }
  };

  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy}
      onClick={handleClick}
      className={`btn ${VARIANTS[variant]} ${SIZES[size]} ${className}`.trim()}
    >
      {busy ? (
        <span className="loading loading-spinner loading-sm" />
      ) : (
        icon && <Icon path={icon} />
      )}
      {children}
    </button>
  );
}
