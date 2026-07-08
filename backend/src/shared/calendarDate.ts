// Shared calendar-date request field (implementation plan Phase 1; Golden Rule 4, CLAUDE §7).
//
// A single source of shape for the `YYYY-MM-DD` calendar date that Dashboard, History, and Insights all
// accept on a request. It is parsed as a plain calendar date and normalized to UTC midnight — matching
// exactly how `Standup.localStandupDate` and `AiSummary.standupDate` are stored (see standups/localDate.ts),
// so it aligns to each person's own local day on the query side. The per-person local-day resolution
// happens upstream (the date picker); this is that resolved date. A datetime or non-date string is rejected.
import { z } from "zod";

export const calendarDateSchema = z.iso
  .date()
  .transform((value) => new Date(`${value}T00:00:00.000Z`));
