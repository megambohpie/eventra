import { useState, type FormEvent } from 'react';
import { mdiAccountOutline, mdiEmailFast, mdiLockQuestion } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '@eventra/api-client';
import { api } from '@/api';
import { AuthCard } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import { notify } from '@/lib/notifications';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await requestPasswordReset(api, email);
      setSent(true);
      notify('success', t('auth.resetRequested'));
    } catch {
      /* error sudah tampil sebagai notifikasi */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      icon={mdiLockQuestion}
      title={t('auth.forgotTitle')}
      subtitle={t('auth.forgotIntro')}
      onSubmit={submit}
    >
      <FormField label={t('auth.email')}>
        <label className="input ev-control">
          <Icon path={mdiAccountOutline} className="ev-input-icon" />
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      </FormField>
      <Button
        type="submit"
        variant="primary"
        icon={mdiEmailFast}
        loading={submitting}
        disabled={sent}
        className="ev-btn--block"
      >
        {t('auth.sendReset')}
      </Button>
      <Link to="/login" className="link link-hover ev-auth__link">
        {t('auth.backToLogin')}
      </Link>
    </AuthCard>
  );
}
