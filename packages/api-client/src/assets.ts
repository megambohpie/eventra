import type { AxiosInstance } from 'axios';
import { uploadBody, type UploadFile } from './upload';
import type {
  AssetBatchDto,
  AssetConditionChangeInput,
  AssetCreateInput,
  AssetDto,
  AssetEventDto,
  AssetGroupDto,
  AssetGroupQuery,
  AssetPhotoDto,
  AssetListQuery,
  AssetScanDto,
  AssetStatusChangeInput,
  AssetSummaryDto,
  AssetUpdateInput,
  StockBreakdownDto,
  StockBreakdownQuery,
  Page,
  ReceiptDto,
  ReceiptInput,
  ReceiptListQuery,
} from '@eventra/shared';

type Envelope<T> = { data: T };

export const listAssets = async (c: AxiosInstance, params: AssetListQuery = {}) =>
  (await c.get<Envelope<Page<AssetDto>>>('/assets', { params })).data.data;
export const getAssetSummary = async (c: AxiosInstance) =>
  (await c.get<Envelope<AssetSummaryDto>>('/assets/summary')).data.data;
export const getStockBreakdown = async (c: AxiosInstance, params: StockBreakdownQuery = {}) =>
  (await c.get<Envelope<StockBreakdownDto>>('/assets/breakdown', { params })).data.data;
export const getAsset = async (c: AxiosInstance, id: string) =>
  (await c.get<Envelope<AssetDto>>(`/assets/${id}`)).data.data;
export const createAsset = async (c: AxiosInstance, input: AssetCreateInput) =>
  (await c.post<Envelope<AssetDto> & { meta: { count: number; ids: string[] } }>('/assets', input))
    .data;
export const listAssetGroups = async (c: AxiosInstance, params: AssetGroupQuery = {}) =>
  (await c.get<Envelope<Page<AssetGroupDto>>>('/assets/groups', { params })).data.data;
export const getAssetBatches = async (
  c: AxiosInstance,
  productId: string,
  params: Omit<AssetGroupQuery, 'page' | 'pageSize'> = {},
) => (await c.get<Envelope<AssetBatchDto[]>>(`/assets/groups/${productId}`, { params })).data.data;
export const updateAsset = async (c: AxiosInstance, id: string, input: AssetUpdateInput) =>
  (await c.put<Envelope<AssetDto>>(`/assets/${id}`, input)).data.data;
export const changeAssetCondition = async (
  c: AxiosInstance,
  id: string,
  input: AssetConditionChangeInput,
) => (await c.post<Envelope<AssetDto>>(`/assets/${id}/condition`, input)).data.data;
export const changeAssetStatus = async (
  c: AxiosInstance,
  id: string,
  input: AssetStatusChangeInput,
) => (await c.post<Envelope<AssetDto>>(`/assets/${id}/status`, input)).data.data;
export const getAssetHistory = async (c: AxiosInstance, id: string) =>
  (await c.get<Envelope<AssetEventDto[]>>(`/assets/${id}/history`)).data.data;
export const regenerateAssetQr = async (c: AxiosInstance, id: string): Promise<void> => {
  await c.post(`/assets/${id}/qr/regenerate`);
};
export const scanAssetQr = async (c: AxiosInstance, token: string) =>
  (await c.get<Envelope<AssetScanDto>>(`/assets/scan/${encodeURIComponent(token)}`)).data.data;

/** Gambar QR (PNG) dihasilkan backend; diambil sebagai Blob karena butuh header autentikasi. */
export const getAssetQrImage = async (c: AxiosInstance, id: string): Promise<Blob> =>
  (await c.get<Blob>(`/assets/${id}/qr.png`, { responseType: 'blob' })).data;
/** PDF label QR (maks. 100 aset per permintaan). */
export const getAssetLabelsPdf = async (c: AxiosInstance, ids: string[]): Promise<Blob> =>
  (
    await c.get<Blob>('/assets/labels.pdf', {
      params: { ids: ids.join(',') },
      responseType: 'blob',
    })
  ).data;

export const listReceipts = async (c: AxiosInstance, params: ReceiptListQuery = {}) =>
  (await c.get<Envelope<Page<ReceiptDto>>>('/stock-receipts', { params })).data.data;
export const getReceipt = async (c: AxiosInstance, id: string) =>
  (await c.get<Envelope<ReceiptDto>>(`/stock-receipts/${id}`)).data.data;
export const createReceipt = async (c: AxiosInstance, input: ReceiptInput) =>
  (await c.post<Envelope<ReceiptDto>>('/stock-receipts', input)).data.data;
export const updateReceipt = async (c: AxiosInstance, id: string, input: ReceiptInput) =>
  (await c.put<Envelope<ReceiptDto>>(`/stock-receipts/${id}`, input)).data.data;
export const cancelReceipt = async (c: AxiosInstance, id: string) =>
  (await c.post<Envelope<ReceiptDto>>(`/stock-receipts/${id}/cancel`)).data.data;
export const receiveReceipt = async (c: AxiosInstance, id: string) =>
  (await c.post<Envelope<ReceiptDto>>(`/stock-receipts/${id}/receive`)).data.data;

export const listAssetPhotos = async (c: AxiosInstance, id: string) =>
  (await c.get<Envelope<AssetPhotoDto[]>>(`/assets/${id}/photos`)).data.data;
export const uploadAssetPhoto = async (c: AxiosInstance, id: string, file: UploadFile) =>
  (
    await c.post<Envelope<AssetPhotoDto>>(`/assets/${id}/photos`, uploadBody(file), {
      headers: { 'Content-Type': file.type },
    })
  ).data.data;
export const getAssetPhoto = async (c: AxiosInstance, id: string, photoId: string) =>
  (await c.get<Blob>(`/assets/${id}/photos/${photoId}`, { responseType: 'blob' })).data;

export const uploadBatchPhoto = async (
  c: AxiosInstance,
  productId: string,
  date: string,
  file: UploadFile,
) =>
  (
    await c.post<Envelope<AssetPhotoDto>>(`/assets/groups/${productId}/photos`, uploadBody(file), {
      params: { date },
      headers: { 'Content-Type': file.type },
    })
  ).data.data;
export const getBatchPhoto = async (c: AxiosInstance, productId: string, photoId: string) =>
  (await c.get<Blob>(`/assets/groups/${productId}/photos/${photoId}`, { responseType: 'blob' }))
    .data;
