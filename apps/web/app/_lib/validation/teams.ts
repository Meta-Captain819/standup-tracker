import { z } from "zod";

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const displayName = z.string().trim().min(1).max(120);

export const addMemberSchema = z.object({
  name: displayName,
  email,
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const setRoleSchema = z.object({
  role: z.enum(["LEAD", "MEMBER"]),
});
export type SetRoleInput = z.infer<typeof setRoleSchema>;

