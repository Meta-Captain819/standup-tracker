
import { z } from "zod";
import { timezoneSchema } from "@/app/_lib/validation/timezones";

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const password = z.string().min(8, "Password must be at least 8 characters.").max(200);
const displayName = z.string().trim().min(1).max(120);
const opaqueToken = z.string().min(1);

export const signupSchema = z.object({
  name: displayName,
  email,
  password,
  teamName: z.string().trim().min(1).max(120),
  timezone: timezoneSchema,
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
  timezone: timezoneSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const acceptInviteSchema = z.object({ token: opaqueToken, password });
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({ token: opaqueToken, password });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
