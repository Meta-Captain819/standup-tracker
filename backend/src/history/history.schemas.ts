// History request schemas — the single source of shape for the backward-browsing surface (implementation
// plan Phase 2; Golden Rule 4, CLAUDE §7). Types are inferred from these schemas; both service and routes
// consume them. The BFF must reuse these shapes rather than hand-copy them (CLAUDE §3/§7).
import { z } from "zod";
import { calendarDateSchema } from "../shared/calendarDate";

// The caller's own timeline is cursor-paginated (architecture §15). The cursor is the id of the last row
// of the previous page (a Prisma cuid); omitted for the first page.
export const myHistoryQuerySchema = z.object({
  cursor: z.cuid().optional(),
});
export type MyHistoryQuery = z.infer<typeof myHistoryQuerySchema>;

// The team's board for a chosen past day — the resolved calendar date, reusing the shared shape so it
// aligns to each person's personal version of that day exactly as the dashboard does (Phase 1).
export const teamHistoryQuerySchema = z.object({
  date: calendarDateSchema,
});
export type TeamHistoryQuery = z.infer<typeof teamHistoryQuerySchema>;
