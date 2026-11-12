import { useState, type FormEvent } from 'react';
import { mdiAccountOutline, mdiOpenInNew, mdiLockOutline, mdiLogin } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { AuthCard } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import { DEMO_PASSWORD } from '@/lib/demoAccounts';

export function LoginPage() {
  const { t } = useTranslation();
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated') return <Navigate to={from} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await login({ email, password });
      navigate(from, { replace: true });
    } catch {
      /* error sudah tampil sebagai notifikasi */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      icon={mdiLockOutline}
      title={t('auth.loginTitle')}
      subtitle={t('auth.loginSubtitle')}
      onSubmit={submit}
    >
      <FormField label={t('auth.email')}>
        <label className="input ev-control">
          <Icon path={mdiAccountOutline} className="ev-input-icon" />
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
      </FormField>
      <FormField label={t('auth.password')}>
        <label className="input ev-control">
          <Icon path={mdiLockOutline} className="ev-input-icon" />
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      </FormField>
      <Button
        type="submit"
        variant="primary"
        icon={mdiLogin}
        loading={submitting}
        className="ev-btn--block"
      >
        {t('auth.login')}
      </Button>
      <Link to="/forgot-password" className="link link-hover ev-auth__link">
        {t('auth.forgotPassword')}
      </Link>
      {DEMO_PASSWORD && (
        <Link
          to="/demo-accounts"
          target="_blank"
          rel="noreferrer"
          className="link link-hover ev-auth__link"
        >
          {t('auth.demoLink')} <Icon path={mdiOpenInNew} />
        </Link>
      )}
    </AuthCard>
  );
}
