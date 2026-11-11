import type { AxiosInstance } from 'axios';
import { healthResponseSchema, type HealthResponse } from '@eventra/shared';

export async function getHealth(client: AxiosInstance): Promise<HealthResponse> {
  const res = await client.get<{ data: unknown }>('/health');
  return healthResponseSchema.parse(res.data.data);
}
