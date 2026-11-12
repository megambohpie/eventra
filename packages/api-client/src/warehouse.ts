import type { AxiosInstance } from 'axios';
import type {
  CheckoutInput,
  DocumentReviseInput,
  DocumentSignInput,
  HandoverDocumentDto,
  OrderSummaryDto,
  Page,
  PickListDto,
  PickListListQuery,
  PickListSummaryDto,
  PickScanInput,
  ReturnCompleteInput,
  ReturnScanInput,
  ScanOutcomeDto,
} from '@eventra/shared';
import { uploadBody, type UploadFile } from './upload';

type Envelope<T> = { data: T };

export const listPickLists = async (c: AxiosInstance, params: PickListListQuery = {}) =>
  (await c.get<Envelope<Page<PickListSummaryDto>>>('/pick-lists', { params })).data.data;
export const listPickableOrders = async (c: AxiosInstance) =>
  (await c.get<Envelope<OrderSummaryDto[]>>('/pick-lists/eligible-orders')).data.data;
export const getPickList = async (c: AxiosInstance, id: string) =>
  (await c.get<Envelope<PickListDto>>(`/pick-lists/${id}`)).data.data;
export const createPickList = async (c: AxiosInstance, orderId: string) =>
  (await c.post<Envelope<PickListDto>>('/pick-lists', { orderId })).data.data;
export const cancelPickListById = async (c: AxiosInstance, id: string) =>
  (await c.post<Envelope<PickListDto>>(`/pick-lists/${id}/cancel`)).data.data;

export const scanPickList = async (c: AxiosInstance, id: string, input: PickScanInput) =>
  (await c.post<Envelope<ScanOutcomeDto>>(`/pick-lists/${id}/scan`, input)).data.data;
export const removePickItem = async (c: AxiosInstance, id: string, itemId: string) =>
  (await c.delete<Envelope<PickListDto>>(`/pick-lists/${id}/items/${itemId}`)).data.data;
export const checkoutPickList = async (c: AxiosInstance, id: string, input: CheckoutInput = {}) =>
  (await c.post<Envelope<PickListDto>>(`/pick-lists/${id}/checkout`, input)).data.data;

export const scanReturn = async (c: AxiosInstance, id: string, input: ReturnScanInput) =>
  (await c.post<Envelope<ScanOutcomeDto>>(`/pick-lists/${id}/return/scan`, input)).data.data;
export const completeReturn = async (
  c: AxiosInstance,
  id: string,
  input: ReturnCompleteInput = {},
) => (await c.post<Envelope<PickListDto>>(`/pick-lists/${id}/return/complete`, input)).data.data;

/** Unggah foto kondisi (JPEG/PNG) sebagai body mentah; backend memvalidasi tipe, ukuran, dan batas 5. */
export const uploadReturnPhoto = async (
  c: AxiosInstance,
  id: string,
  itemId: string,
  file: UploadFile,
) =>
  (
    await c.post<Envelope<ScanOutcomeDto>>(
      `/pick-lists/${id}/items/${itemId}/photos`,
      uploadBody(file),
      {
        headers: { 'Content-Type': file.type },
      },
    )
  ).data.data;
export const getReturnPhoto = async (
  c: AxiosInstance,
  id: string,
  itemId: string,
  photoId: string,
): Promise<Blob> =>
  (
    await c.get<Blob>(`/pick-lists/${id}/items/${itemId}/photos/${photoId}`, {
      responseType: 'blob',
    })
  ).data;

export const getHandoverDocument = async (c: AxiosInstance, id: string) =>
  (await c.get<Envelope<HandoverDocumentDto>>(`/handover-documents/${id}`)).data.data;
export const getHandoverPdf = async (c: AxiosInstance, id: string): Promise<Blob> =>
  (await c.get<Blob>(`/handover-documents/${id}/pdf`, { responseType: 'blob' })).data;
export const signHandoverDocument = async (
  c: AxiosInstance,
  id: string,
  input: DocumentSignInput,
) =>
  (await c.post<Envelope<HandoverDocumentDto>>(`/handover-documents/${id}/sign`, input)).data.data;
export const reviseHandoverDocument = async (
  c: AxiosInstance,
  id: string,
  input: DocumentReviseInput,
) =>
  (await c.post<Envelope<HandoverDocumentDto>>(`/handover-documents/${id}/revise`, input)).data
    .data;
