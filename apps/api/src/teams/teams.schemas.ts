
import { z } from "zod";
import { Role } from "../generated/prisma/client";

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const displayName = z.string().trim().min(1).max(120);


export const addMemberSchema = z.object({
  name: displayName,
  email,
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;


export const memberParamsSchema = z.object({ userId: z.cuid() });
export type MemberParams = z.infer<typeof memberParamsSchema>;

export const setRoleSchema = z.object({
  role: z.enum([Role.LEAD, Role.MEMBER]),
});
export type SetRoleInput = z.infer<typeof setRoleSchema>;
