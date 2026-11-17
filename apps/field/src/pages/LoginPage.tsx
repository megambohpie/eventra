import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { loginSchema } from '@eventra/shared';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Field, Muted } from '@/components/ui';
import { errorMessage } from '@/lib/errors';

export function LoginPage() {
  const { status, login } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string; search?: string } } | null)?.from;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (status === 'authenticated') {
    return <Navigate to={from ? `${from.pathname}${from.search ?? ''}` : '/'} replace />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError('Masukkan email yang valid dan kata sandi.');
      return;
    }
    try {
      await login(parsed.data);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="ev-login">
      <form className="card ev-card ev-login__card" onSubmit={submit}>
        <div className="card-body ev-card__body">
          <img className="ev-login__logo" src="/eventra-icon.svg" alt="Eventra" />
          <h1 className="ev-screen__title">Masuk</h1>
          <Field label="Email">
            <input
              className="input ev-control"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Kata sandi">
            <input
              className="input ev-control"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && <p className="ev-error-text">{error}</p>}
          <Button type="submit" className="ev-btn--block" loading={false}>
            Masuk
          </Button>
        </div>
      </form>
      <Muted>Sistem ini dibuat oleh PT Trijaya Digital Koneksindo.</Muted>
    </div>
  );
}
