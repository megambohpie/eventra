import axios from 'axios';
import { Router } from 'express';
import { z } from 'zod';
import { roundCoord, type GeocodeResultDto } from '@eventra/shared';
import { requireCapability } from '../auth/middleware';
import { HttpError } from '../errors';

const querySchema = z.object({
  q: z.string().trim().min(3).max(200),
  lang: z.enum(['id', 'en']).default('id'),
});

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

/** Mengambil hasil dari Nominatim (OpenStreetMap). Dipisah agar mudah diganti/diuji. */
export async function searchPlaces(q: string, lang: string): Promise<GeocodeResultDto[]> {
  let rows: { lat: string; lon: string; display_name: string }[];
  try {
    // Kebijakan Nominatim mewajibkan User-Agent yang mengenali aplikasi.
    const res = await axios.get<typeof rows>(NOMINATIM, {
      params: { format: 'jsonv2', limit: 8, q, 'accept-language': lang },
      headers: { 'User-Agent': 'Eventra/1.0 (asset-rental)' },
      timeout: 8000,
    });
    rows = res.data;
  } catch {
    throw new HttpError(502, 'GEOCODE_UNAVAILABLE', 'Layanan pencarian lokasi tidak tersedia');
  }
  return rows
    .map((r) => ({ lat: Number(r.lat), lng: Number(r.lon), label: String(r.display_name) }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
    .map((r) => ({ ...r, lat: roundCoord(r.lat), lng: roundCoord(r.lng) }));
}

export function geocodeRouter(): Router {
  const router = Router();

  /** Pencarian nama tempat/alamat → koordinat (untuk pemilih titik peta pada pesanan). */
  router.get('/geocode/search', requireCapability('order.write'), async (req, res) => {
    const q = querySchema.parse(req.query);
    res.json({ data: await searchPlaces(q.q, q.lang) });
  });

  return router;
}
