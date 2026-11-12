import type { ReactNode } from 'react';

/** Kartu konten halaman. Tampilan diatur di styles/base.css (`.ev-card`). */
export function PageCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ev-card ${className}`.trim()}>
      <div className="card-body ev-card__body">{children}</div>
    </section>
  );
}

/** Judul halaman + subjudul di kiri, aksi (cari, tombol) di kanan. */
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="ev-page-header">
      <div>
        <h1 className="ev-page-header__title">{title}</h1>
        {subtitle && <p className="ev-page-header__subtitle">{subtitle}</p>}
      </div>
      {children && <div className="ev-page-header__actions">{children}</div>}
    </div>
  );
}
