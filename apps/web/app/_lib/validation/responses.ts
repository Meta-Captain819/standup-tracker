
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
export type SessionResult = z.infer<typeof sessionResultSchema>;

export const meResponseSchema = z.object({
  userId: z.string(),
  teamId: z.string(),
  role: roleSchema,
  name: z.string(),
  email: z.string(),
});

export const acceptInviteResponseSchema = z.object({ user: publicUserSchema });

export const okResponseSchema = z.object({ ok: z.literal(true) });

const isoString = z.string();

export const standupSchema = z.object({
  id: z.string(),
  yesterday: z.string(),
  today: z.string(),
  blockers: z.string(),
  submittedAtUtc: isoString,
  timezone: z.string(),
  localStandupDate: isoString,
  editedAt: isoString.nullable(),
});
export type Standup = z.infer<typeof standupSchema>;

const memberStatusSchema = z.enum(["pending", "active"]);

export const rosterMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  timezone: z.string().nullable(),
  status: memberStatusSchema,
});
export type RosterMember = z.infer<typeof rosterMemberSchema>;

export const boardStandupSchema = standupSchema.extend({
  hasBlocker: z.boolean(),
});
export type BoardStandup = z.infer<typeof boardStandupSchema>;

export const liveBoardSchema = z.object({
  view: z.literal("live"),
  cards: z.array(
    z.object({
      userId: z.string(),
      name: z.string(),
      role: roleSchema,
      status: memberStatusSchema,
      currentLocalDate: isoString.nullable(),
      latest: boardStandupSchema.nullable(),
      hasPostedToday: z.boolean(),
    }),
  ),
});

export const dateBoardSchema = z.object({
  view: z.literal("date"),
  date: isoString,
  cards: z.array(
    z.object({
      userId: z.string(),
      name: z.string(),
      role: roleSchema,
      status: memberStatusSchema,
      standup: boardStandupSchema.nullable(),
      hasUpdate: z.boolean(),
    }),
  ),
});

export const boardSchema = z.discriminatedUnion("view", [liveBoardSchema, dateBoardSchema]);
export type LiveBoard = z.infer<typeof liveBoardSchema>;
export type DateBoard = z.infer<typeof dateBoardSchema>;
export type Board = z.infer<typeof boardSchema>;

export const historyPageSchema = z.object({
  items: z.array(standupSchema),
  nextCursor: z.string().nullable(),
});
export type StandupHistoryPage = z.infer<typeof historyPageSchema>;

export const daySummarySchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ready"),
    standupDate: isoString,
    summary: z.string(),
    generatedAt: isoString,
  }),
  z.object({ status: z.literal("unavailable") }),
]);
export type DaySummary = z.infer<typeof daySummarySchema>;
