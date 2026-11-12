import type { AxiosInstance } from 'axios';
import type { AuthSession, CreateUserInput, LoginInput, Page, UserDto } from '@eventra/shared';

type Envelope<T> = { data: T };

export const login = async (client: AxiosInstance, input: LoginInput): Promise<AuthSession> =>
  (await client.post<Envelope<AuthSession>>('/auth/login', input)).data.data;

export const refreshSession = async (
  client: AxiosInstance,
  refreshToken: string,
): Promise<AuthSession> =>
  (await client.post<Envelope<AuthSession>>('/auth/refresh', { refreshToken })).data.data;

export const logout = async (client: AxiosInstance, refreshToken: string): Promise<void> => {
  await client.post('/auth/logout', { refreshToken });
};

export const requestPasswordReset = async (client: AxiosInstance, email: string): Promise<void> => {
  await client.post('/auth/password-reset/request', { email });
};

export const confirmPasswordReset = async (
  client: AxiosInstance,
  token: string,
  password: string,
): Promise<void> => {
  await client.post('/auth/password-reset/confirm', { token, password });
};

export const getMe = async (client: AxiosInstance): Promise<UserDto> =>
  (await client.get<Envelope<UserDto>>('/me')).data.data;

export const listUsers = async (
  client: AxiosInstance,
  params: { q?: string; page?: number; pageSize?: number } = {},
): Promise<Page<UserDto>> =>
  (await client.get<Envelope<Page<UserDto>>>('/users', { params })).data.data;

export const createUser = async (client: AxiosInstance, input: CreateUserInput): Promise<UserDto> =>
  (await client.post<Envelope<UserDto>>('/users', input)).data.data;
