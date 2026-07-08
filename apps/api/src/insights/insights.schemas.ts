
import { z } from "zod";
import { calendarDateSchema } from "../shared/calendarDate";

export const standupDateSchema = calendarDateSchema;

export const refreshFlagSchema = z.boolean().default(false);

export const summaryDateInputSchema = z.object({ standupDate: standupDateSchema });
export type SummaryDateInput = z.infer<typeof summaryDateInputSchema>;

const GENERATED_SUMMARY_MAX_CHARS = 8000;
export const generatedSummarySchema = z.string().trim().min(1).max(GENERATED_SUMMARY_MAX_CHARS);
export type GeneratedSummary = z.infer<typeof generatedSummarySchema>;
