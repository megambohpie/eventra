import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { apiErrorSchema, type ApiError } from '@eventra/shared';

export interface ApiClientOptions {
  baseURL: string;
  /** Dipanggil pada setiap request untuk menyisipkan access token. */
  getAccessToken?: () => string | null | undefined;
  /**
   * Dipanggil saat API membalas 401 pada endpoint non-auth. Bila mengembalikan access token baru,
   * request diulang satu kali; null berarti sesi tidak bisa dipulihkan. Panggilan bersamaan dibagi satu proses.
   */
  refreshSession?: () => Promise<string | null>;
  /** Dipanggil saat sesi tidak dapat dipulihkan (mis. kembali ke halaman login). */
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

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

const isAuthEndpoint = (config?: AxiosRequestConfig): boolean =>
  (config?.url ?? '').startsWith('/auth/');

function toApiError(error: AxiosError): ApiRequestError {
  const status = error.response?.status;
  const parsed = apiErrorSchema.safeParse(error.response?.data);
  if (parsed.success) {
    const { code, message, fields } = parsed.data.error;
    return new ApiRequestError(status, code, message, fields);
  }
  return new ApiRequestError(
    status,
    error.response ? 'HTTP_ERROR' : 'NETWORK_ERROR',
    error.response ? error.message : 'Cannot reach the server',
  );
}

/** Satu-satunya jalur HTTP frontend (web & mobile). Jangan memakai fetch langsung. */
export function createApiClient(options: ApiClientOptions): AxiosInstance {
  const client = axios.create({ baseURL: options.baseURL, timeout: 15_000 });
  let refreshing: Promise<string | null> | null = null;

  const refreshOnce = (): Promise<string | null> => {
    refreshing ??= (options.refreshSession?.() ?? Promise.resolve(null))
      .catch(() => null)
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  };

  client.interceptors.request.use((config) => {
    const token = options.getAccessToken?.();
    if (token) config.headers.set('Authorization', `Bearer ${token}`);
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
      if (!(error instanceof AxiosError)) throw error;
      const config = error.config as RetriableConfig | undefined;
      const status = error.response?.status;

      if (status === 401 && config && !isAuthEndpoint(config)) {
        if (options.refreshSession && !config._retried) {
          const token = await refreshOnce();
          if (token) {
            config._retried = true;
            config.headers.set('Authorization', `Bearer ${token}`);
            return client.request(config);
          }
        }
        options.onUnauthorized?.();
      }

      const apiError = toApiError(error);
      options.onError?.(apiError);
      throw apiError;
    },
  );

  return client;
}
