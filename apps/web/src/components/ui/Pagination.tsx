import { mdiChevronLeft, mdiChevronRight } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onChange }: PaginationProps) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="ev-pagination">
      <span className="ev-pagination__info">{t('common.totalItems', { count: total })}</span>
      <div className="ev-pagination__controls">
        <Button
          variant="ghost"
          size="sm"
          icon={mdiChevronLeft}
          disabled={page <= 1}
          aria-label={t('common.prev')}
          onClick={() => onChange(page - 1)}
        />
        <span className="ev-pagination__page">{t('common.pageOf', { page, pages })}</span>
        <Button
          variant="ghost"
          size="sm"
          icon={mdiChevronRight}
          disabled={page >= pages}
          aria-label={t('common.next')}
          onClick={() => onChange(page + 1)}
        />
      </div>
    </div>
  );
}
