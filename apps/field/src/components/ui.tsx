import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { mdiChevronLeft, mdiRefresh } from '@mdi/js';
import { Button } from './Button';

/** Kartu ringkas; bila `to` diisi seluruh kartu menjadi tautan. */
export function Card({ children, to }: { children: ReactNode; to?: string }) {
  if (to) {
    return (
      <Link to={to} className="card ev-card ev-card--link">
        <div className="card-body ev-card__body">{children}</div>
      </Link>
    );
  }
  return (
    <div className="card ev-card">
      <div className="card-body ev-card__body">{children}</div>
    </div>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="ev-row">
      <span className="ev-row__label">{label}</span>
      <span className="ev-row__value">{value}</span>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="ev-section">
      <h2 className="ev-section__title">{title}</h2>
      {children}
    </section>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="ev-muted">{children}</p>;
}

export function Strong({ children }: { children: ReactNode }) {
  return <p className="ev-strong">{children}</p>;
}

/** Judul halaman dengan tombol kembali (halaman rinci) dan muat ulang. */
export function Screen({
  title,
  back,
  onRefresh,
  children,
}: {
  title: string;
  /** Tampilkan tombol kembali ke riwayat sebelumnya. */
  back?: boolean;
  onRefresh?: () => void;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="ev-screen">
      <header className="ev-screen__head">
        {back && (
          <Button
            variant="ghost"
            size="sm"
            icon={mdiChevronLeft}
            aria-label="Kembali"
            onClick={() => void navigate(-1)}
          />
        )}
        <h1 className="ev-screen__title">{title}</h1>
        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            icon={mdiRefresh}
            aria-label="Muat ulang"
            onClick={onRefresh}
          />
        )}
      </header>
      {children}
    </div>
  );
}

export function Loading() {
  return (
    <div className="ev-loading">
      <span className="loading loading-spinner loading-lg" />
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className="ev-empty">{message}</p>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="ev-error">
      <p>{message}</p>
      <Button variant="ghost" onClick={onRetry}>
        Coba lagi
      </Button>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="ev-field">
      <span className="ev-field__label">{label}</span>
      {children}
    </label>
  );
}

/** Pilihan satu dari beberapa nilai tetap. */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Field label={label}>
      <select
        className="select ev-control"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
