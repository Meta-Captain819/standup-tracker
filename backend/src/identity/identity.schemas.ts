// Identity request schemas — the single source of shape for the auth surface (auth plan Phase 2/3;
// Golden Rule 4, CLAUDE §7). Types are inferred from these schemas; both service and routes consume
// them. The BFF must reuse these same schemas via workspace tooling rather than hand-copying them
// (flagged gap, auth plan §5.1).
import { z } from "zod";
import { timezoneSchema } from "../shared/ianaZones";

// Shared field rules. Email is normalized (trim + lowercase) before format validation so global
// uniqueness and login lookups match regardless of casing/whitespace.
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
  // Presence only — strength is irrelevant at login and must not shape the generic failure.
  password: z.string().min(1).max(200),
  timezone: timezoneSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: opaqueToken });
export type RefreshInput = z.infer<typeof refreshSchema>;

export const logoutSchema = z.object({ refreshToken: opaqueToken });
export type LogoutInput = z.infer<typeof logoutSchema>;

export const acceptInviteSchema = z.object({ token: opaqueToken, password });
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({ token: opaqueToken, password });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
