import { useTranslation } from 'react-i18next';
import { getStockBreakdown } from '@eventra/api-client';
import { api } from '@/api';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { useResource } from '@/hooks/useResource';

interface StockBreakdownModalProps {
  onClose: () => void;
}

/** Rekap stok per barang × batch × merek (seperti lembar Excel), lengkap dengan total luas m². */
export function StockBreakdownModal({ onClose }: StockBreakdownModalProps) {
  const { t } = useTranslation();
  const { data } = useResource(() => getStockBreakdown(api), 'stock-breakdown');

  return (
    <Modal open title={t('assets.breakdown.title')} onClose={onClose} wide>
      {!data ? (
        <Loading />
      ) : (
        <>
          <p className="ev-hint">{t('assets.breakdown.hint')}</p>
          <div className="ev-table-wrap">
            <table className="table">
              <thead className="ev-table__head">
                <tr>
                  <th>{t('assets.product')}</th>
                  <th>{t('assets.breakdown.batch')}</th>
                  <th>{t('assets.breakdown.brand')}</th>
                  <th>{t('assets.qty')}</th>
                  <th>{t('assets.breakdown.area')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={`${row.productId}|${row.batchLabel ?? ''}|${row.brand ?? ''}`}>
                    <td>{row.productName}</td>
                    <td>{row.batchLabel ?? '-'}</td>
                    <td>{row.brand ?? t('assets.noBrand')}</td>
                    <td className="ev-qty">{row.quantity}</td>
                    <td>{row.areaM2 === null ? '-' : row.areaM2}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="ev-table__empty">
                      {t('common.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
              {data.rows.length > 0 && (
                <tfoot>
                  <tr>
                    <th colSpan={3}>{t('assets.breakdown.total')}</th>
                    <th className="ev-qty">{data.totalQuantity}</th>
                    <th />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
