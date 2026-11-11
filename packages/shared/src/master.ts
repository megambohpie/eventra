import { z } from 'zod';
import { emailSchema } from './identity';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const CUSTOMER_TYPES = ['INDIVIDUAL', 'COMPANY'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const customerContactInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(3).max(30),
  position: optionalText(80),
});
export type CustomerContactInput = z.infer<typeof customerContactInputSchema>;

export const customerContactUpdateSchema = customerContactInputSchema.extend({
  active: z.boolean().optional(),
});
export type CustomerContactUpdateInput = z.infer<typeof customerContactUpdateSchema>;

const customerBase = z.object({
  type: z.enum(CUSTOMER_TYPES),
  name: z.string().trim().min(1).max(160),
  email: emailSchema.optional(),
  phone: optionalText(30),
  address: optionalText(500),
  verificationNote: optionalText(500),
});
/** Pelanggan baru wajib membawa minimal satu PIC penyewa. */
export const customerCreateSchema = customerBase.extend({
  contacts: z.array(customerContactInputSchema).min(1),
});
export const customerUpdateSchema = customerBase.extend({ active: z.boolean().optional() });
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

export const PRICING_UNITS = ['PCS', 'PACKAGE'] as const;
export type PricingUnit = (typeof PRICING_UNITS)[number];

/** Nominal rupiah selalu integer (TECHNICAL_SPEC §10). */
const rupiah = z.number().int().min(0).max(100_000_000_000);

export const productInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  sku: optionalText(40),
  categoryId: z.uuid(),
  pricingUnit: z.enum(PRICING_UNITS),
  unitLabel: z.string().trim().min(1).max(30),
  price: rupiah,
  deposit: rupiah,
  active: z.boolean().optional(),
});
export type ProductInput = z.infer<typeof productInputSchema>;

export const categoryInputSchema = z.object({ name: z.string().trim().min(1).max(80) });
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const locationInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: optionalText(500),
  active: z.boolean().optional(),
});
export type LocationInput = z.infer<typeof locationInputSchema>;

export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CustomerContactDto {
  id: string;
  customerId: string;
  name: string;
  phone: string;
  position: string | null;
  active: boolean;
}
export interface CustomerDto {
  id: string;
  type: CustomerType;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  verificationNote: string | null;
  active: boolean;
  contacts: CustomerContactDto[];
}
export interface CategoryDto {
  id: string;
  name: string;
}
export interface LocationDto {
  id: string;
  name: string;
  address: string | null;
  active: boolean;
}
export interface ProductDto {
  id: string;
  name: string;
  sku: string | null;
  categoryId: string;
  category: CategoryDto;
  pricingUnit: PricingUnit;
  unitLabel: string;
  price: number;
  deposit: number;
  active: boolean;
}
