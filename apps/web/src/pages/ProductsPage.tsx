import { useState } from 'react';
import { mdiPlus } from '@mdi/js';
import { useTranslation } from 'react-i18next';
import { listCategories, listProducts } from '@eventra/api-client';
import type { ProductDto } from '@eventra/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { BundleModal } from '@/components/products/BundleModal';
import { ProductThumb } from '@/components/products/ProductThumb';
import { ProductModal } from '@/components/products/ProductModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { PageCard, PageHeader } from '@/components/ui/PageCard';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { useResource } from '@/hooks/useResource';
import { formatRupiah } from '@/lib/format';

const PAGE_SIZE = 20;

export function ProductsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canWrite = can('product.write');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ProductDto | 'new' | null>(null);
  const [bundleOf, setBundleOf] = useState<ProductDto | null>(null);
  const [photoVersion, setPhotoVersion] = useState(0);

  const { data, loading, reload } = useResource(
    () => listProducts(api, { q: q || undefined, page, pageSize: PAGE_SIZE }),
    `${q}|${page}`,
  );
  const categories = useResource(() => listCategories(api), 'categories');
  const allProducts = useResource(() => listProducts(api, { pageSize: 100 }), 'all-products');

  return (
    <>
      <PageCard>
        <PageHeader title={t('products.title')}>
          <SearchInput
            value={q}
            onChange={(value) => {
              setQ(value);
              setPage(1);
            }}
          />
          {canWrite && (
            <Button
              size="sm"
              variant="primary"
              icon={mdiPlus}
              disabled={!categories.data}
              onClick={() => setSelected('new')}
            >
              {t('products.new')}
            </Button>
          )}
        </PageHeader>
        {loading && !data ? (
          <Loading />
        ) : (
          <div className="ev-table-wrap">
            <table className="table">
              <thead className="ev-table__head">
                <tr>
                  <th>{t('products.photo')}</th>
                  <th>{t('products.name')}</th>
                  <th>{t('products.sku')}</th>
                  <th>{t('products.category')}</th>
                  <th>{t('products.price')}</th>
                  <th>{t('products.deposit')}</th>
                  <th>{t('common.status')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data?.items.map((product) => (
                  <tr key={product.id} className="ev-table__row">
                    <td>
                      <ProductThumb
                        productId={product.id}
                        hasPhoto={product.hasPhoto}
                        version={photoVersion}
                      />
                    </td>
                    <td>
                      {product.name}
                      {(product.stockMode !== 'TRACKED' || product.areaPoolId) && (
                        <span className="ev-table__hint ev-table__hint--block">
                          {product.areaPoolId
                            ? t('products.poolMemberBadge', {
                                name:
                                  allProducts.data?.items.find((p) => p.id === product.areaPoolId)
                                    ?.name ?? '',
                              })
                            : t(`products.stockModes.${product.stockMode}`)}
                        </span>
                      )}
                    </td>
                    <td>{product.sku ?? '-'}</td>
                    <td>{product.category?.name ?? '-'}</td>
                    <td>
                      {formatRupiah(product.unitPrice)} / {product.unitLabel}
                      <span className="ev-table__hint">
                        ({t(`products.units.${product.pricingUnit}`)}
                        {product.pricingUnit === 'AREA' ? `: ${formatRupiah(product.price)}` : ''})
                      </span>
                    </td>
                    <td>{formatRupiah(product.deposit)}</td>
                    <td>
                      <Badge variant={product.active ? 'success' : 'neutral'}>
                        {product.active ? t('common.active') : t('common.inactive')}
                      </Badge>
                    </td>
                    <td className="ev-table__actions">
                      <Button size="sm" variant="ghost" onClick={() => setBundleOf(product)}>
                        {t('products.bundle.action')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setSelected(product)}>
                        {canWrite ? t('common.edit') : t('common.view')}
                      </Button>
                    </td>
                  </tr>
                ))}
                {data?.items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="ev-table__empty">
                      {t('common.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {data && (
          <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
        )}
      </PageCard>

      {bundleOf && (
        <BundleModal
          key={bundleOf.id}
          product={bundleOf}
          candidates={(allProducts.data?.items ?? []).filter((p) => p.active)}
          readOnly={!canWrite}
          onClose={() => setBundleOf(null)}
        />
      )}
      {selected && categories.data && (
        <ProductModal
          key={selected === 'new' ? 'new' : selected.id}
          product={selected === 'new' ? undefined : selected}
          categories={categories.data}
          pools={(allProducts.data?.items ?? []).filter((p) => p.stockMode === 'AREA_POOL')}
          readOnly={!canWrite}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setPhotoVersion((v) => v + 1);
            reload();
          }}
        />
      )}
    </>
  );
}
