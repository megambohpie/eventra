import type { AxiosInstance } from 'axios';
import type {
  AssetMetricsDto,
  AssetRentalDto,
  DashboardQuery,
  DpStatusDto,
  DpWaiverInput,
  InvoiceCreateInput,
  InvoiceDto,
  InvoiceListQuery,
  InvoiceSummaryDto,
  InvoiceVoidInput,
  OwnerDashboardDto,
  Page,
  PaymentCreateInput,
  PaymentPolicyDto,
  PaymentPolicyInput,
  PaymentReasonInput,
  ReceivablesReportDto,
  ReminderInput,
  RevenueQuery,
  RevenueReportDto,
} from '@eventra/shared';

type Envelope<T> = { data: T };

// ---------- Kebijakan DP ----------

export const getPaymentPolicy = async (c: AxiosInstance) =>
  (await c.get<Envelope<PaymentPolicyDto>>('/settings/payment-policy')).data.data;
export const updatePaymentPolicy = async (c: AxiosInstance, input: PaymentPolicyInput) =>
  (await c.put<Envelope<PaymentPolicyDto>>('/settings/payment-policy', input)).data.data;
export const getOrderDp = async (c: AxiosInstance, orderId: string) =>
  (await c.get<Envelope<DpStatusDto>>(`/orders/${orderId}/dp`)).data.data;
export const waiveOrderDp = async (c: AxiosInstance, orderId: string, input: DpWaiverInput) =>
  (await c.post<Envelope<DpStatusDto>>(`/orders/${orderId}/dp-waiver`, input)).data.data;

// ---------- Invoice & pembayaran ----------

export const listInvoices = async (c: AxiosInstance, params: InvoiceListQuery = {}) =>
  (await c.get<Envelope<Page<InvoiceSummaryDto>>>('/invoices', { params })).data.data;
export const getInvoice = async (c: AxiosInstance, id: string) =>
  (await c.get<Envelope<InvoiceDto>>(`/invoices/${id}`)).data.data;
export const createInvoice = async (c: AxiosInstance, input: InvoiceCreateInput) =>
  (await c.post<Envelope<InvoiceDto>>('/invoices', input)).data.data;
export const voidInvoice = async (c: AxiosInstance, id: string, input: InvoiceVoidInput) =>
  (await c.post<Envelope<InvoiceDto>>(`/invoices/${id}/void`, input)).data.data;
export const remindInvoice = async (c: AxiosInstance, id: string, input: ReminderInput = {}) =>
  (await c.post<Envelope<InvoiceDto>>(`/invoices/${id}/remind`, input)).data.data;
export const createPayment = async (c: AxiosInstance, id: string, input: PaymentCreateInput) =>
  (await c.post<Envelope<InvoiceDto>>(`/invoices/${id}/payments`, input)).data.data;
export const confirmPayment = async (c: AxiosInstance, paymentId: string) =>
  (await c.post<Envelope<InvoiceDto>>(`/payments/${paymentId}/confirm`)).data.data;
export const rejectPayment = async (
  c: AxiosInstance,
  paymentId: string,
  input: PaymentReasonInput,
) => (await c.post<Envelope<InvoiceDto>>(`/payments/${paymentId}/reject`, input)).data.data;
export const voidPayment = async (c: AxiosInstance, paymentId: string, input: PaymentReasonInput) =>
  (await c.post<Envelope<InvoiceDto>>(`/payments/${paymentId}/void`, input)).data.data;

// ---------- Laporan & dashboard ----------

export const getRevenueReport = async (c: AxiosInstance, params: RevenueQuery) =>
  (await c.get<Envelope<RevenueReportDto>>('/reports/revenue', { params })).data.data;
export const getReceivablesReport = async (c: AxiosInstance) =>
  (await c.get<Envelope<ReceivablesReportDto>>('/reports/receivables')).data.data;
export const getOwnerDashboard = async (c: AxiosInstance, params: DashboardQuery = {}) =>
  (await c.get<Envelope<OwnerDashboardDto>>('/dashboards/owner', { params })).data.data;
export const listAssetRentals = async (c: AxiosInstance, assetId: string) =>
  (await c.get<Envelope<AssetRentalDto[]>>(`/assets/${assetId}/rentals`)).data.data;
export const getAssetMetrics = async (c: AxiosInstance, assetId: string) =>
  (await c.get<Envelope<AssetMetricsDto>>(`/assets/${assetId}/metrics`)).data.data;
