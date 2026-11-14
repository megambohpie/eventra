import { mdiArrowLeft } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { AssetDetailView } from '@/components/assets/AssetDetailView';
import { Icon } from '@/components/ui/Icon';
import { PageCard, PageHeader } from '@/components/ui/PageCard';

export function AssetDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  return (
    <div className="ev-detail">
      <PageCard>
        <PageHeader title={t('assets.detail.title')}>
          <Link to="/assets" className="btn btn-ghost btn-sm">
            <Icon path={mdiArrowLeft} />
            {t('common.back')}
          </Link>
        </PageHeader>
      </PageCard>
      <AssetDetailView id={id} />
    </div>
  );
}
