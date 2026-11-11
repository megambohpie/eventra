import { z } from 'zod';
import { ROLES } from './rbac';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
export const passwordSchema = z.string().min(8).max(128);

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(1) });
export const passwordResetRequestSchema = z.object({ email: emailSchema });
export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  phone: z.string().trim().max(30).optional(),
  password: passwordSchema,
  role: z.enum(ROLES),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export interface UserDto {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: (typeof ROLES)[number];
  active: boolean;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}
