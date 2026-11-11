import { createApiClient } from '@eventra/api-client';

/** Client Axios bersama (paket yang sama dengan web). */
export const api = createApiClient({
  baseURL: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1',
});
