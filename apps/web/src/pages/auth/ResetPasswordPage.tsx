import { useState, type FormEvent } from 'react';
import { mdiKeyOutline, mdiLockOutline, mdiLockReset } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { confirmPasswordReset } from '@eventra/api-client';
import { api } from '@/api';
import { AuthCard } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import { notify } from '@/lib/notifications';

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get('token') ?? '');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await confirmPasswordReset(api, token, password);
      notify('success', t('auth.resetDone'));
      navigate('/login');
    } catch {
      /* error sudah tampil sebagai notifikasi */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard icon={mdiLockReset} title={t('auth.resetTitle')} onSubmit={submit}>
      <FormField label={t('auth.resetToken')}>
        <label className="input w-full">
          <Icon path={mdiKeyOutline} className="opacity-60" />
          <input required value={token} onChange={(e) => setToken(e.target.value)} />
        </label>
      </FormField>
      <FormField label={t('auth.newPassword')}>
        <label className="input w-full">
          <Icon path={mdiLockOutline} className="opacity-60" />
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      </FormField>
      <Button
        type="submit"
        variant="primary"
        icon={mdiLockReset}
        loading={submitting}
        className="w-full"
      >
        {t('auth.resetSubmit')}
      </Button>
      <Link to="/login" className="link link-hover text-center text-sm">
        {t('auth.backToLogin')}
      </Link>
    </AuthCard>
  );
}
