// Dashboard request schemas — the single source of shape for the board surface (implementation plan
// Phase 1; Golden Rule 4, CLAUDE §7). Types are inferred from these schemas; both service and routes
// consume them. The BFF must reuse these shapes rather than hand-copy them (same backend-owned-schema
// gap recorded in the other modules' schema files — CLAUDE §3/§7).
import { z } from "zod";
import { calendarDateSchema } from "../shared/calendarDate";

// GET /dashboard[?date=YYYY-MM-DD]. Omitting `date` yields the live board (latest update per person);
// supplying a date yields the date-picker board aligned to each person's personal version of that day
// (architecture §8). Optional and normalized to UTC midnight by the shared calendar-date schema.
export const boardQuerySchema = z.object({
  date: calendarDateSchema.optional(),
});
export type BoardQuery = z.infer<typeof boardQuerySchema>;
