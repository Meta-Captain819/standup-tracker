// AI Insights request schemas — the single source of shape for the insights surface (AI module plan
// Phase 1; Golden Rule 4, CLAUDE §7). Types are inferred from these schemas; the service consumes them.
// The BFF must reuse these shapes rather than hand-copy them (same backend-owned-schema gap recorded in
// the other modules' schema files — CLAUDE §3/§7).
import { z } from "zod";
import { calendarDateSchema } from "../shared/calendarDate";

// The calendar day a summary covers — the shared calendar-date shape now lives in `shared/calendarDate`
// so Dashboard, History, and Insights all validate it against one definition (implementation plan Phase 1,
// CLAUDE §7). Re-exported under the module-local name the service and tests already consume.
export const standupDateSchema = calendarDateSchema;

// Whether a lead is explicitly asking to regenerate an already-cached summary (bypassing an up-to-date
// cache). Defaults to false; consumed by the caching path when a lead hits refresh (AI module plan Phase 5/6).
export const refreshFlagSchema = z.boolean().default(false);

// The identifying input every insights read/generate shares: the day being summarized.
export const summaryDateInputSchema = z.object({ standupDate: standupDateSchema });
export type SummaryDateInput = z.infer<typeof summaryDateInputSchema>;

// The model's raw output is parsed into this shape before it is ever trusted, stored, or returned (AI
// module plan Phase 4): the guard against a malformed response or prompt-injection leakage yielding junk.
// The model is already output-capped (GEMINI_MAX_OUTPUT_TOKENS); this rejects an empty response and
// bounds length defensively — anything that fails to parse is treated as a generation failure.
const GENERATED_SUMMARY_MAX_CHARS = 8000;
export const generatedSummarySchema = z.string().trim().min(1).max(GENERATED_SUMMARY_MAX_CHARS);
export type GeneratedSummary = z.infer<typeof generatedSummarySchema>;
