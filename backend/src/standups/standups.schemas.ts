// Standups request schemas — the single source of shape for the standup surface (implementation plan
// Phase 4/5; Golden Rule 4, CLAUDE §7). Types are inferred from these schemas; both service and routes
// consume them. The BFF must reuse these shapes rather than hand-copy them (same backend-owned-schema
// gap recorded in identity.schemas.ts / teams.schemas.ts — CLAUDE §3/§7).
import { z } from "zod";
import { timezoneSchema } from "../shared/ianaZones";

// A single standup answer: free text, may be empty (an empty blockers field is valid). Capped to a
// generous length to bound request size. Stored verbatim — treated as untrusted downstream (escaped on
// render, summarize-only at the AI boundary), never sanitized away here.
const answer = z.string().max(5000);

// ── Phase 4: submit ─────────────────────────────────────────────────────────────────────────────

// Encodes the product rule directly (CLAUDE §7): short text allowed, an empty blockers field allowed,
// and only the fully-blank case (all three empty/whitespace) rejected — never enforced ad hoc in a handler.
export const submitStandupSchema = z
  .object({
    yesterday: answer,
    today: answer,
    blockers: answer,
    timezone: timezoneSchema,
  })
  .refine(
    (v) => v.yesterday.trim() !== "" || v.today.trim() !== "" || v.blockers.trim() !== "",
    { message: "Fill in at least one field.", path: ["yesterday"] },
  );
export type SubmitStandupInput = z.infer<typeof submitStandupSchema>;

// ── Phase 5: edit & member read of own updates ────────────────────────────────────────────────────

// Editing replaces the three answers (keeping the latest text) and reuses submit's exact shape and
// non-blank rule; the target update is addressed by its id.
export const standupIdParamsSchema = z.object({ id: z.cuid() });
export type StandupIdParams = z.infer<typeof standupIdParamsSchema>;

// "Today" is read against the writer's current browser zone (CLAUDE §6), captured as a validated
// query param so the lookup aligns to their personal current local day.
export const todayQuerySchema = z.object({ timezone: timezoneSchema });
export type TodayQuery = z.infer<typeof todayQuerySchema>;
