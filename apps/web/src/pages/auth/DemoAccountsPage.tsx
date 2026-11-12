import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { ROLES, demoAccountEmail } from '@eventra/shared';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { DEMO_PASSWORD } from '@/lib/demoAccounts';

/** Daftar akun contoh per role (khusus development). */
export function DemoAccountsPage() {
  const { t } = useTranslation();
  if (!DEMO_PASSWORD) return <Navigate to="/login" replace />;

  return (
    <div className="ev-demo">
      <PageHeader title={t('auth.demoPageTitle')} subtitle={t('auth.demoPageSubtitle')} />
      <PageCard>
        <div className="ev-table-wrap">
          <table className="table">
            <thead className="ev-table__head">
              <tr>
                <th>{t('auth.demoRole')}</th>
                <th>{t('auth.email')}</th>
                <th>{t('auth.password')}</th>
              </tr>
            </thead>
            <tbody>
              {ROLES.map((role) => (
                <tr key={role} className="ev-table__row">
                  <td>{t(`roles.${role}`)}</td>
                  <td>
                    <code>{demoAccountEmail(role)}</code>
                  </td>
                  <td>
                    <code>{DEMO_PASSWORD}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageCard>
    </div>
  );
}
