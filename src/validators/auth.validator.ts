import { z } from 'zod';

const nameSchema = z.string().trim().min(1).max(80);
// Trim + lowercase must run before the email-format check, hence `.pipe`.
const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
const passwordSchema = z.string().min(8).max(72);

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  acceptedTerms: z.literal(true),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});

export const updateMeSchema = z
  .object({
    name: nameSchema,
    avatarUrl: z.string().url().nullable(),
    timezone: z.string().min(1),
  })
  .partial();

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
