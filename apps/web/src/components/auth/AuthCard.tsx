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
    <div className="ev-auth">
      <form onSubmit={onSubmit} className="card ev-auth__card">
        <div className="card-body ev-auth__body">
          <div className="ev-auth__head">
            <span className="ev-auth__badge">
              <Icon path={icon} />
            </span>
            <h1 className="ev-auth__title">{title}</h1>
            {subtitle && <p className="ev-auth__subtitle">{subtitle}</p>}
          </div>
          {children}
        </div>
      </form>
    </div>
  );
}
