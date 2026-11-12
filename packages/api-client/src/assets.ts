import type { AxiosInstance } from 'axios';
import type {
  AssetConditionChangeInput,
  AssetCreateInput,
  AssetDto,
  AssetEventDto,
  AssetListQuery,
  AssetScanDto,
  AssetStatusChangeInput,
  AssetSummaryDto,
  AssetUpdateInput,
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
export const getAsset = async (c: AxiosInstance, id: string) =>
  (await c.get<Envelope<AssetDto>>(`/assets/${id}`)).data.data;
export const createAsset = async (c: AxiosInstance, input: AssetCreateInput) =>
  (await c.post<Envelope<AssetDto>>('/assets', input)).data.data;
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
