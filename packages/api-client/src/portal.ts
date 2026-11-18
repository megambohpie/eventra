import type { AxiosInstance } from 'axios';
import type {
  PortalDocumentSignInput,
  PortalLoginInput,
  PortalOrderDto,
  PortalSession,
} from '@eventra/shared';

type Envelope<T> = { data: T };

/** Login pelanggan: nomor HP pemesan + nomor pesanan. Token hanya berlaku untuk satu pesanan. */
export const portalLogin = async (
  c: AxiosInstance,
  input: PortalLoginInput,
): Promise<PortalSession> =>
  (await c.post<Envelope<PortalSession>>('/portal/login', input)).data.data;

export const getPortalOrder = async (c: AxiosInstance): Promise<PortalOrderDto> =>
  (await c.get<Envelope<PortalOrderDto>>('/portal/order')).data.data;

/** Pelanggan menandatangani dokumen pesanannya (peran penerima/pengembali). */
export const portalSignDocument = async (
  c: AxiosInstance,
  id: string,
  input: PortalDocumentSignInput,
): Promise<void> => {
  await c.post(`/portal/documents/${id}/sign`, input);
};
