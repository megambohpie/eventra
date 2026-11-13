import type { AxiosInstance } from 'axios';
import type {
  AvailabilityCalendarQuery,
  AvailabilityCheckInput,
  AvailabilityDayDto,
  AvailabilityResultDto,
  BundleInput,
  CalendarDayDetailDto,
  CalendarDayDto,
  CalendarOrderDto,
  GeocodeResultDto,
  HoldInput,
  OrderDto,
  OrderInput,
  OrderListQuery,
  OrderNoteInput,
  OrderPicDto,
  OrderSummaryDto,
  Page,
  PicInput,
  ProductBundleDto,
  QuoteInput,
} from '@eventra/shared';

type Envelope<T> = { data: T };

export const listProductBundles = async (c: AxiosInstance) =>
  (await c.get<Envelope<ProductBundleDto[]>>('/product-bundles')).data.data;
export const getProductBundle = async (c: AxiosInstance, productId: string) =>
  (await c.get<Envelope<ProductBundleDto>>(`/product-bundles/${productId}`)).data.data;
export const saveProductBundle = async (c: AxiosInstance, productId: string, input: BundleInput) =>
  (await c.put<Envelope<ProductBundleDto>>(`/product-bundles/${productId}`, input)).data.data;

export const checkAvailability = async (c: AxiosInstance, input: AvailabilityCheckInput) =>
  (await c.post<Envelope<AvailabilityResultDto>>('/availability/check', input)).data.data;
export const getAvailabilityCalendar = async (
  c: AxiosInstance,
  params: AvailabilityCalendarQuery,
) => (await c.get<Envelope<AvailabilityDayDto[]>>('/availability/calendar', { params })).data.data;

export const listOrders = async (c: AxiosInstance, params: OrderListQuery = {}) =>
  (await c.get<Envelope<Page<OrderSummaryDto>>>('/orders', { params })).data.data;
export const getOrder = async (c: AxiosInstance, id: string) =>
  (await c.get<Envelope<OrderDto>>(`/orders/${id}`)).data.data;
export const createOrder = async (c: AxiosInstance, input: OrderInput) =>
  (await c.post<Envelope<OrderDto>>('/orders', input)).data.data;
export const updateOrder = async (c: AxiosInstance, id: string, input: OrderInput) =>
  (await c.put<Envelope<OrderDto>>(`/orders/${id}`, input)).data.data;
export const submitOrder = async (c: AxiosInstance, id: string) =>
  (await c.post<Envelope<OrderDto>>(`/orders/${id}/submit`)).data.data;
export const quoteOrder = async (c: AxiosInstance, id: string, input: QuoteInput = {}) =>
  (await c.post<Envelope<OrderDto>>(`/orders/${id}/quote`, input)).data.data;
export const holdOrder = async (c: AxiosInstance, id: string, input: HoldInput = {}) =>
  (await c.post<Envelope<OrderDto>>(`/orders/${id}/hold`, input)).data.data;
export const confirmOrder = async (c: AxiosInstance, id: string) =>
  (await c.post<Envelope<OrderDto>>(`/orders/${id}/confirm`, {})).data.data;
export const rejectOrder = async (c: AxiosInstance, id: string, input: OrderNoteInput = {}) =>
  (await c.post<Envelope<OrderDto>>(`/orders/${id}/reject`, input)).data.data;
export const cancelOrder = async (c: AxiosInstance, id: string, input: OrderNoteInput = {}) =>
  (await c.post<Envelope<OrderDto>>(`/orders/${id}/cancel`, input)).data.data;
export const scheduleOrder = async (c: AxiosInstance, id: string) =>
  (await c.post<Envelope<OrderDto>>(`/orders/${id}/schedule`)).data.data;

export const addOrderPic = async (c: AxiosInstance, orderId: string, input: PicInput) =>
  (await c.post<Envelope<OrderPicDto[]>>(`/orders/${orderId}/pics`, input)).data.data;
export const updateOrderPic = async (
  c: AxiosInstance,
  orderId: string,
  picId: string,
  input: PicInput,
) => (await c.put<Envelope<OrderPicDto[]>>(`/orders/${orderId}/pics/${picId}`, input)).data.data;
export const deleteOrderPic = async (c: AxiosInstance, orderId: string, picId: string) =>
  (await c.delete<Envelope<OrderPicDto[]>>(`/orders/${orderId}/pics/${picId}`)).data.data;

export const getMovementCalendar = async (c: AxiosInstance, from: string, to: string) =>
  (await c.get<Envelope<CalendarDayDto[]>>('/calendar', { params: { from, to } })).data.data;
export const getCalendarOrders = async (c: AxiosInstance, from: string, to: string) =>
  (await c.get<Envelope<CalendarOrderDto[]>>('/calendar/orders', { params: { from, to } })).data
    .data;
export const getMovementDay = async (c: AxiosInstance, date: string) =>
  (await c.get<Envelope<CalendarDayDetailDto>>('/calendar/day', { params: { date } })).data.data;
export const searchPlaces = async (c: AxiosInstance, q: string, lang: 'id' | 'en') =>
  (await c.get<Envelope<GeocodeResultDto[]>>('/geocode/search', { params: { q, lang } })).data.data;
