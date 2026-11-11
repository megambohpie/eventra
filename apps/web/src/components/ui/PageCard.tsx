import type { ReactNode } from 'react';

/** Kartu konten halaman: sudut membulat, bayangan lembut, tanpa garis tebal. */
export function PageCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`card rounded-3xl border border-base-300/40 bg-base-100 shadow-sm ${className}`.trim()}
    >
      <div className="card-body gap-5 p-5 sm:p-7">{children}</div>
    </section>
  );
}

/** Judul halaman + subjudul di kiri, aksi (cari, tombol) di kanan; membungkus di layar kecil. */
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
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-base-content/60">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
