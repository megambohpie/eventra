import axios, { AxiosError, type AxiosInstance } from 'axios';
import { apiErrorSchema, type ApiError } from '@eventra/shared';

export interface ApiClientOptions {
  baseURL: string;
  /** Dipanggil pada setiap request untuk menyisipkan token auth (diisi pada Fase 01). */
  getAccessToken?: () => string | null | undefined;
  /** Dipanggil saat API membalas 401 (diisi pada Fase 01). */
  onUnauthorized?: () => void;
  /** Dipanggil untuk setiap error API/jaringan, sebelum error dilempar (untuk menampilkan notifikasi). */
  onError?: (error: ApiRequestError) => void;
}

/** Error terstruktur yang dilempar oleh client untuk respons non-2xx. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number | undefined,
    readonly code: string,
    message: string,
    readonly fields?: ApiError['error']['fields'],
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/** Satu-satunya jalur HTTP frontend (web & mobile). Jangan memakai fetch langsung. */
export function createApiClient(options: ApiClientOptions): AxiosInstance {
  const client = axios.create({ baseURL: options.baseURL, timeout: 15_000 });

  client.interceptors.request.use((config) => {
    const token = options.getAccessToken?.();
    if (token) config.headers.set('Authorization', `Bearer ${token}`);
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      if (!(error instanceof AxiosError)) throw error;
      const status = error.response?.status;
      if (status === 401) options.onUnauthorized?.();
      const parsed = apiErrorSchema.safeParse(error.response?.data);
      const apiError = parsed.success
        ? new ApiRequestError(
            status,
            parsed.data.error.code,
            parsed.data.error.message,
            parsed.data.error.fields,
          )
        : new ApiRequestError(
            status,
            error.response ? 'HTTP_ERROR' : 'NETWORK_ERROR',
            error.response ? error.message : 'Cannot reach the server',
          );
      options.onError?.(apiError);
      throw apiError;
    },
  );

  return client;
}
