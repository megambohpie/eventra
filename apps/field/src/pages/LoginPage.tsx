import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { portalLogin } from '@eventra/api-client';
import { loginSchema, portalLoginSchema } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { usePortal } from '@/auth/portal';
import { Button } from '@/components/Button';
import { Field, Muted } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { setPortal } from '@/lib/session';

type Mode = 'customer' | 'staff';

/** Masuk pelanggan (no HP + no pesanan, satu pesanan per login) atau staf (email + kata sandi). */
export function LoginPage() {
  const { status, login } = useAuth();
  const portal = usePortal();
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as { from?: { pathname: string; search?: string } } | null)?.from;
  const [mode, setMode] = useState<Mode>('customer');
  const [phone, setPhone] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (status === 'authenticated') {
    return <Navigate to={from ? `${from.pathname}${from.search ?? ''}` : '/'} replace />;
  }
  if (portal) return <Navigate to="/p" replace />;

  const submitCustomer = async () => {
    const parsed = portalLoginSchema.safeParse({ phone, orderNumber });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Periksa isian Anda.');
      return;
    }
    setPortal(await portalLogin(api, parsed.data));
    void navigate('/p', { replace: true });
  };

  const submitStaff = async () => {
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError('Masukkan email yang valid dan kata sandi.');
      return;
    }
    await login(parsed.data);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await (mode === 'customer' ? submitCustomer() : submitStaff());
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const switchMode = () => {
    setError(null);
    setMode(mode === 'customer' ? 'staff' : 'customer');
  };

  return (
    <div className="ev-login">
      <form className="card ev-card ev-login__card" onSubmit={submit}>
        <div className="card-body ev-card__body">
          <img className="ev-login__logo" src="/eventra-icon.svg" alt="Eventra" />
          <h1 className="ev-screen__title">{mode === 'customer' ? 'Cek pesanan' : 'Masuk staf'}</h1>
          {mode === 'customer' ? (
            <>
              <Muted>
                Masukkan nomor HP yang dipakai saat memesan dan nomor pesanan. Satu login hanya
                untuk satu pesanan.
              </Muted>
              <Field label="Nomor HP">
                <input
                  className="input ev-control"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0812 3456 7890"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
              <Field label="Nomor pesanan">
                <input
                  className="input ev-control"
                  autoCapitalize="characters"
                  autoComplete="off"
                  placeholder="ORD-2027-000123"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                />
              </Field>
            </>
          ) : (
            <>
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
            </>
          )}
          {error && <p className="ev-error-text">{error}</p>}
          <Button type="submit" className="ev-btn--block" loading={false}>
            {mode === 'customer' ? 'Lihat pesanan' : 'Masuk'}
          </Button>
          <div className="divider ev-login__divider" />
          <Button variant="outline" className="ev-btn--block" onClick={switchMode}>
            {mode === 'customer' ? 'Masuk sebagai staf' : 'Saya pelanggan'}
          </Button>
        </div>
      </form>
      <Muted>Sistem ini dibuat oleh PT Trijaya Digital Koneksindo.</Muted>
    </div>
  );
}
