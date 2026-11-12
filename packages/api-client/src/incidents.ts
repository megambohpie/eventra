import type { AxiosInstance } from 'axios';
import type {
  IncidentCloseInput,
  IncidentCreateInput,
  IncidentDto,
  IncidentListQuery,
  IncidentReviewInput,
  IncidentSummaryDto,
  NotificationListDto,
  Page,
  PickScanInput,
  ReplacementCancelInput,
  ReplacementListQuery,
  ReplacementReceiveInput,
  ReplacementTaskDto,
  ServiceTicketCancelInput,
  ServiceTicketCompleteInput,
  ServiceTicketCreateInput,
  ServiceTicketDto,
  ServiceTicketListQuery,
  ServiceTicketStartInput,
} from '@eventra/shared';
import { uploadBody, type UploadFile } from './upload';

type Envelope<T> = { data: T };

// ---------- Insiden ----------

export const listIncidents = async (c: AxiosInstance, params: IncidentListQuery = {}) =>
  (await c.get<Envelope<Page<IncidentSummaryDto>>>('/incidents', { params })).data.data;
export const getIncident = async (c: AxiosInstance, id: string) =>
  (await c.get<Envelope<IncidentDto>>(`/incidents/${id}`)).data.data;
export const createIncident = async (c: AxiosInstance, input: IncidentCreateInput) =>
  (await c.post<Envelope<IncidentDto>>('/incidents', input)).data.data;
/** Unggah foto (JPEG/PNG) sebagai body mentah; backend memvalidasi tipe, ukuran, dan batas 5. */
export const uploadIncidentPhoto = async (c: AxiosInstance, id: string, file: UploadFile) =>
  (
    await c.post<Envelope<IncidentDto>>(`/incidents/${id}/photos`, uploadBody(file), {
      headers: { 'Content-Type': file.type },
    })
  ).data.data;
export const getIncidentPhoto = async (
  c: AxiosInstance,
  id: string,
  photoId: string,
): Promise<Blob> =>
  (await c.get<Blob>(`/incidents/${id}/photos/${photoId}`, { responseType: 'blob' })).data;
export const submitIncident = async (c: AxiosInstance, id: string) =>
  (await c.post<Envelope<IncidentDto>>(`/incidents/${id}/submit`)).data.data;
export const reviewIncident = async (c: AxiosInstance, id: string, input: IncidentReviewInput) =>
  (await c.post<Envelope<IncidentDto>>(`/incidents/${id}/review`, input)).data.data;
export const closeIncident = async (c: AxiosInstance, id: string, input: IncidentCloseInput) =>
  (await c.post<Envelope<IncidentDto>>(`/incidents/${id}/close`, input)).data.data;

// ---------- Tugas penggantian ----------

export const listReplacements = async (c: AxiosInstance, params: ReplacementListQuery = {}) =>
  (await c.get<Envelope<Page<ReplacementTaskDto>>>('/replacement-tasks', { params })).data.data;
export const getReplacement = async (c: AxiosInstance, id: string) =>
  (await c.get<Envelope<ReplacementTaskDto>>(`/replacement-tasks/${id}`)).data.data;
export const scanReplacement = async (c: AxiosInstance, id: string, input: PickScanInput) =>
  (await c.post<Envelope<ReplacementTaskDto>>(`/replacement-tasks/${id}/scan`, input)).data.data;
export const releaseReplacementAsset = async (c: AxiosInstance, id: string) =>
  (await c.delete<Envelope<ReplacementTaskDto>>(`/replacement-tasks/${id}/asset`)).data.data;
export const dispatchReplacement = async (c: AxiosInstance, id: string) =>
  (await c.post<Envelope<ReplacementTaskDto>>(`/replacement-tasks/${id}/dispatch`)).data.data;
export const receiveReplacement = async (
  c: AxiosInstance,
  id: string,
  input: ReplacementReceiveInput,
) =>
  (await c.post<Envelope<ReplacementTaskDto>>(`/replacement-tasks/${id}/receive`, input)).data.data;
export const cancelReplacement = async (
  c: AxiosInstance,
  id: string,
  input: ReplacementCancelInput,
) =>
  (await c.post<Envelope<ReplacementTaskDto>>(`/replacement-tasks/${id}/cancel`, input)).data.data;

// ---------- Tiket servis ----------

export const listServiceTickets = async (c: AxiosInstance, params: ServiceTicketListQuery = {}) =>
  (await c.get<Envelope<Page<ServiceTicketDto>>>('/service-tickets', { params })).data.data;
export const getServiceTicket = async (c: AxiosInstance, id: string) =>
  (await c.get<Envelope<ServiceTicketDto>>(`/service-tickets/${id}`)).data.data;
export const createServiceTicket = async (c: AxiosInstance, input: ServiceTicketCreateInput) =>
  (await c.post<Envelope<ServiceTicketDto>>('/service-tickets', input)).data.data;
export const startServiceTicket = async (
  c: AxiosInstance,
  id: string,
  input: ServiceTicketStartInput = {},
) => (await c.post<Envelope<ServiceTicketDto>>(`/service-tickets/${id}/start`, input)).data.data;
export const completeServiceTicket = async (
  c: AxiosInstance,
  id: string,
  input: ServiceTicketCompleteInput,
) => (await c.post<Envelope<ServiceTicketDto>>(`/service-tickets/${id}/complete`, input)).data.data;
export const cancelServiceTicket = async (
  c: AxiosInstance,
  id: string,
  input: ServiceTicketCancelInput,
) => (await c.post<Envelope<ServiceTicketDto>>(`/service-tickets/${id}/cancel`, input)).data.data;

// ---------- Notifikasi ----------

export const listNotifications = async (c: AxiosInstance) =>
  (await c.get<Envelope<NotificationListDto>>('/notifications')).data.data;
export const markNotificationRead = async (c: AxiosInstance, id: string) => {
  await c.post(`/notifications/${id}/read`);
};
export const markAllNotificationsRead = async (c: AxiosInstance) => {
  await c.post('/notifications/read-all');
};
