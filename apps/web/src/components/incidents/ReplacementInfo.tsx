import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { ReplacementTaskDto } from '@eventra/shared';
import { ConditionBadge } from '@/components/assets/badges';
import { formatDateTime } from '@/lib/format';
import { ReplacementStatusBadge } from './badges';

/** Ringkasan tugas penggantian: aset lama ↔ aset pengganti, tertaut ke insiden yang sama. */
export function ReplacementInfo({ task }: { task: ReplacementTaskDto }) {
  const { t } = useTranslation();
  return (
    <dl className="ev-dl">
      <div className="ev-dl__row">
        <dt className="ev-dl__term">{t('replacements.number')}</dt>
        <dd className="ev-dl__desc">
          {task.number} <ReplacementStatusBadge status={task.status} />
        </dd>
      </div>
      <div className="ev-dl__row">
        <dt className="ev-dl__term">{t('replacements.oldAsset')}</dt>
        <dd className="ev-dl__desc">
          <Link className="ev-link" to={`/assets/${task.oldAsset.id}`}>
            {task.oldAsset.code}
          </Link>
        </dd>
      </div>
      <div className="ev-dl__row">
        <dt className="ev-dl__term">{t('replacements.newAsset')}</dt>
        <dd className="ev-dl__desc">
          {task.replacementAsset ? (
            <Link className="ev-link" to={`/assets/${task.replacementAsset.id}`}>
              {task.replacementAsset.code}
            </Link>
          ) : (
            '-'
          )}
        </dd>
      </div>
      {task.dispatchedAt && (
        <div className="ev-dl__row">
          <dt className="ev-dl__term">{t('replacements.dispatchedAt')}</dt>
          <dd className="ev-dl__desc">{formatDateTime(task.dispatchedAt)}</dd>
        </div>
      )}
      {task.receivedAt && (
        <div className="ev-dl__row">
          <dt className="ev-dl__term">{t('replacements.receivedAt')}</dt>
          <dd className="ev-dl__desc">
            {formatDateTime(task.receivedAt)}
            {task.receivedBy && ` · ${task.receivedBy}`}{' '}
            {task.receiveCondition && <ConditionBadge condition={task.receiveCondition} />}
          </dd>
        </div>
      )}
    </dl>
  );
}
