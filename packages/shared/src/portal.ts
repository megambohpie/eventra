import { z } from 'zod';
import type { IncidentStatus, IncidentUrgency } from './incidents';
import type { InvoiceStatus } from './finance';
import type { OrderStatus } from './orders';
import { documentSignSchema, type HandoverType } from './warehouse';

/**
 * Normalisasi nomor HP Indonesia ke bentuk digit `62…` agar `0812…`, `+62 812…`, dan `812…`
 * dianggap sama. Hanya untuk pencocokan; nomor yang tersimpan tidak diubah.
 */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return `62${digits}`;
}

/** Login pelanggan: nomor HP yang dipakai memesan + nomor pesanan. Akses hanya untuk satu pesanan itu. */
export const portalLoginSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(8, 'Nomor HP tidak valid')
    .max(20, 'Nomor HP tidak valid')
    .regex(/^[+\d][\d\s-]*$/, 'Nomor HP tidak valid'),
  orderNumber: z
    .string()
    .trim()
    .min(3, 'Nomor pesanan wajib diisi')
    .max(40)
    .transform((v) => v.toUpperCase()),
});
export type PortalLoginInput = z.infer<typeof portalLoginSchema>;

/**
 * Tanda tangan pelanggan (peran penerima/pengembali) pada dokumen pesanannya. Tanpa `picId`,
 * penanda tangan adalah pemesan itu sendiri (nama dari data pelanggan).
 */
export const portalDocumentSignSchema = documentSignSchema
  .omit({ role: true, picId: true })
  .extend({ picId: documentSignSchema.shape.picId.optional() });
export type PortalDocumentSignInput = z.input<typeof portalDocumentSignSchema>;

export interface PortalSession {
  accessToken: string;
  orderNumber: string;
  customerName: string;
  /** ISO; setelah ini pelanggan harus login ulang. */
  expiresAt: string;
}

export interface PortalOrderItemDto {
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface PortalAssetDto {
  code: string;
  productName: string;
  /** Aset yang masih dapat dilaporkan rusak. */
  reportable: boolean;
}

export interface PortalPaymentDto {
  id: string;
  purpose: 'RENT' | 'DEPOSIT';
  method: string;
  status: string;
  amount: number;
  paidAt: string;
}

export interface PortalInvoiceDto {
  id: string;
  number: string;
  status: InvoiceStatus;
  rentAmount: number;
  depositAmount: number;
  total: number;
  paid: number;
  outstanding: number;
  dueDate: string;
  payments: PortalPaymentDto[];
}

export interface PortalDocumentDto {
  id: string;
  number: string;
  version: number;
  type: HandoverType;
  createdAt: string;
  fullySigned: boolean;
  isLatest: boolean;
  /** Pihak pelanggan sudah menandatangani. */
  counterpartSigned: boolean;
  /** PIC pelanggan/lapangan yang boleh dipilih selain pemesan sendiri. */
  signers: { id: string; name: string }[];
}

export interface PortalIncidentDto {
  id: string;
  number: string;
  status: IncidentStatus;
  urgency: IncidentUrgency;
  assetCode: string;
  productName: string;
  createdAt: string;
}

export interface PortalOrderDto {
  number: string;
  status: OrderStatus;
  customerName: string;
  startDate: string;
  endDate: string;
  eventLocation: string;
  eventAddress: string | null;
  subtotal: number;
  depositTotal: number;
  items: PortalOrderItemDto[];
  assets: PortalAssetDto[];
  invoices: PortalInvoiceDto[];
  documents: PortalDocumentDto[];
  incidents: PortalIncidentDto[];
}
