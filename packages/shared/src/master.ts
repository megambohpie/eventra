import { z } from 'zod';
import { emailSchema } from './identity';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/** Nomor telepon: hanya angka, boleh diawali + (3–20 digit); kosong dianggap tidak diisi. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?\d{3,20}$/, 'Nomor telepon hanya boleh berisi angka')
  .optional()
  .or(z.literal('').transform(() => undefined));

export const CUSTOMER_TYPES = ['INDIVIDUAL', 'COMPANY'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

const customerBase = z.object({
  type: z.enum(CUSTOMER_TYPES),
  name: z.string().trim().min(1).max(160),
  email: emailSchema.optional(),
  phone: phoneSchema,
  address: optionalText(500),
  verificationNote: optionalText(500),
});
export const customerCreateSchema = customerBase;
export const customerUpdateSchema = customerBase.extend({ active: z.boolean().optional() });
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

/** AREA = tarif per m²; harga satu unit dihitung dari ukuran (lihat `effectiveUnitPrice`). */
export const PRICING_UNITS = ['PCS', 'PACKAGE', 'AREA'] as const;
export type PricingUnit = (typeof PRICING_UNITS)[number];

/**
 * TRACKED = aset per-unit ber-QR dengan stok terbatas. UNLIMITED = tanpa aset/QR; stok tidak
 * membatasi pesanan (mis. kabel jumper yang bisa dibuat kapan saja) dan dihitung jumlahnya.
 * AREA_POOL = produk "per meter" (mis. Videotron per m²): dipesan dalam m², tanpa aset sendiri;
 * stoknya total luas kabinet anggota (`areaPoolId`), dan gudang bebas memilih ukuran kabinet.
 */
export const STOCK_MODES = ['TRACKED', 'UNLIMITED', 'AREA_POOL'] as const;
export type StockMode = (typeof STOCK_MODES)[number];

/** Nominal rupiah selalu integer (TECHNICAL_SPEC §10). */
const rupiah = z.number().int().min(0).max(100_000_000_000);

export const productInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    sku: optionalText(40),
    /** Kategori opsional: produk boleh tanpa kategori. */
    categoryId: z.uuid().nullable().optional(),
    pricingUnit: z.enum(PRICING_UNITS),
    unitLabel: z.string().trim().min(1).max(30),
    price: rupiah,
    deposit: rupiah,
    active: z.boolean().optional(),
    stockMode: z.enum(STOCK_MODES).optional(),
    /** Kabinet anggota kelompok "per meter": id produk AREA_POOL tujuannya (null = bukan anggota). */
    areaPoolId: z.uuid().nullable().optional(),
    /** Ukuran kabinet/panel dalam cm; isi keduanya atau kosongkan keduanya. */
    widthCm: z.number().int().min(1).max(10_000).nullable().optional(),
    heightCm: z.number().int().min(1).max(10_000).nullable().optional(),
  })
  .refine((p) => (p.widthCm == null) === (p.heightCm == null), {
    path: ['widthCm'],
    message: 'Panjang dan lebar harus diisi bersamaan',
  })
  .refine((p) => p.pricingUnit !== 'AREA' || (p.widthCm != null && p.heightCm != null), {
    path: ['widthCm'],
    message: 'Harga per m² membutuhkan ukuran (panjang dan lebar)',
  })
  .refine((p) => !p.areaPoolId || (p.widthCm != null && p.heightCm != null), {
    path: ['widthCm'],
    message: 'Kabinet anggota kelompok per meter membutuhkan ukuran (panjang dan lebar)',
  })
  .refine((p) => !p.areaPoolId || (p.stockMode ?? 'TRACKED') === 'TRACKED', {
    path: ['areaPoolId'],
    message: 'Hanya produk berstok terlacak (QR) yang dapat menjadi anggota kelompok per meter',
  });
export type ProductInput = z.infer<typeof productInputSchema>;

/** Luas satu unit dalam cm² (bilangan bulat, aman untuk menjumlah); null bila ukuran kosong. */
export const unitAreaCm2 = (p: {
  widthCm: number | null;
  heightCm: number | null;
}): number | null => (p.widthCm && p.heightCm ? p.widthCm * p.heightCm : null);

/** 1 m² = 10.000 cm². */
export const CM2_PER_M2 = 10_000;

/** Luas satu unit dalam m² (null bila ukuran belum diisi). */
export const unitAreaM2 = (p: {
  widthCm: number | null;
  heightCm: number | null;
}): number | null => (p.widthCm && p.heightCm ? (p.widthCm * p.heightCm) / 10_000 : null);

/**
 * Harga sewa satu unit per hari. PCS/PACKAGE: harga apa adanya. AREA: tarif per m² × luas satu unit,
 * dibulatkan ke rupiah (mis. tarif 500.000/m²: kabinet 100×50 = 250.000, 50×50 = 125.000).
 */
export const effectiveUnitPrice = (p: {
  pricingUnit: PricingUnit;
  price: number;
  widthCm: number | null;
  heightCm: number | null;
}): number => {
  if (p.pricingUnit !== 'AREA') return p.price;
  const area = unitAreaM2(p);
  return area === null ? 0 : Math.round(p.price * area);
};

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

export interface CustomerDto {
  id: string;
  type: CustomerType;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  verificationNote: string | null;
  active: boolean;
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
  categoryId: string | null;
  category: CategoryDto | null;
  pricingUnit: PricingUnit;
  unitLabel: string;
  /** Harga yang diinput: harga per unit, atau tarif per m² bila `pricingUnit` = AREA. */
  price: number;
  /** Harga sewa satu unit per hari yang benar-benar ditagihkan (AREA: tarif × luas satu unit). */
  unitPrice: number;
  deposit: number;
  active: boolean;
  /** Foto produk opsional; byte diambil lewat GET /products/:id/photo. */
  hasPhoto: boolean;
  stockMode: StockMode;
  /** Kelompok "per meter" tempat kabinet ini menjadi anggota; tidak bisa dipesan langsung bila terisi. */
  areaPoolId: string | null;
  widthCm: number | null;
  heightCm: number | null;
}
