import type { FormEvent, ReactNode } from 'react';
import { Icon } from '../ui/Icon';

interface AuthCardProps {
  /** MDI icon path untuk lencana di atas judul. */
  icon: string;
  title: string;
  subtitle?: string;
  onSubmit: (event: FormEvent) => void;
  children: ReactNode;
}

/** Kartu form tengah halaman yang dipakai login, lupa password, dan reset password. */
export function AuthCard({ icon, title, subtitle, onSubmit, children }: AuthCardProps) {
  return (
    <div className="flex min-h-[calc(100vh-14rem)] items-center justify-center py-6">
      <form
        onSubmit={onSubmit}
        className="card w-full max-w-md border border-base-300 bg-base-100 shadow-xl"
      >
        <div className="card-body gap-4 p-6 sm:p-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Icon path={icon} size={1.75} />
            </span>
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle && <p className="text-sm opacity-70">{subtitle}</p>}
          </div>
          {children}
        </div>
      </form>
    </div>
  );
}
