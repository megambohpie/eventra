import { describe, expect, it } from 'vitest';
import { formatCoordinates, googleMapsUrl, parseCoordinates } from './geo';
import { orderInputSchema } from './orders';

describe('parseCoordinates', () => {
  it('membaca format salinan Google Maps', () => {
    expect(parseCoordinates('-6.208763, 106.845599')).toEqual({ lat: -6.208763, lng: 106.845599 });
    expect(parseCoordinates('  -6.2 106.8 ')).toEqual({ lat: -6.2, lng: 106.8 });
  });
  it('membaca koordinat dari URL', () => {
    const url =
      'https://www.google.com/maps/place/Balai/@-6.2297,106.8,17z/data=!3d-6.2297465!4d106.8261';
    expect(parseCoordinates(url)).toEqual({ lat: -6.229746, lng: 106.8261 });
    expect(parseCoordinates('https://maps.google.com/?q=-7.25,112.75')).toEqual({
      lat: -7.25,
      lng: 112.75,
    });
  });
  it('menolak teks tidak valid atau di luar jangkauan', () => {
    expect(parseCoordinates('')).toBeNull();
    expect(parseCoordinates('Jakarta')).toBeNull();
    expect(parseCoordinates('95, 10')).toBeNull();
    expect(parseCoordinates('10, 190')).toBeNull();
  });
  it('memformat dan membuat tautan', () => {
    expect(formatCoordinates({ lat: -6.2, lng: 106.8 })).toBe('-6.200000, 106.800000');
    expect(googleMapsUrl({ lat: -6.2, lng: 106.8 })).toBe(
      'https://www.google.com/maps?q=-6.2,106.8',
    );
  });
});

describe('input pesanan: alamat & titik', () => {
  const base = {
    customerId: '00000000-0000-4000-8000-000000000001',
    startDate: '2026-12-01',
    endDate: '2026-12-02',
    eventLocation: 'Balai',
    items: [{ productId: '00000000-0000-4000-8000-000000000001', quantity: 1 }],
  };
  it('menerima alamat dengan titik lengkap atau tanpa titik', () => {
    expect(
      orderInputSchema.safeParse({
        ...base,
        eventAddress: 'Jl. A 1',
        eventLat: -6.2,
        eventLng: 106.8,
      }).success,
    ).toBe(true);
    expect(orderInputSchema.safeParse({ ...base, eventLat: null, eventLng: null }).success).toBe(
      true,
    );
  });
  it('menolak titik setengah atau di luar jangkauan', () => {
    expect(orderInputSchema.safeParse({ ...base, eventLat: -6.2 }).success).toBe(false);
    expect(orderInputSchema.safeParse({ ...base, eventLat: 99, eventLng: 10 }).success).toBe(false);
  });
});
