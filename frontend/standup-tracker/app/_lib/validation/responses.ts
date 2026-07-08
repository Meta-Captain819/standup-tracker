// Runtime (Zod) counterparts to the response shapes described in app/_lib/types/user.ts — used by
// apiFetch to validate what Express actually returned before it's trusted further.
import { z } from "zod";
import { ROLES } from "@/app/_lib/types/role";

const roleSchema = z.enum(ROLES);

export const publicUserSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  email: z.string(),
  name: z.string(),
  role: roleSchema,
});

export const sessionResultSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: publicUserSchema,
});

export const meResponseSchema = z.object({
  userId: z.string(),
  teamId: z.string(),
  role: roleSchema,
  name: z.string(),
  email: z.string(),
});

export const acceptInviteResponseSchema = z.object({ user: publicUserSchema });

export const okResponseSchema = z.object({ ok: z.literal(true) });
