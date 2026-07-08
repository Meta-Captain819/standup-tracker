
import { z } from "zod";
import { calendarDateSchema } from "../shared/calendarDate";

export const myHistoryQuerySchema = z.object({
  cursor: z.cuid().optional(),
});
export type MyHistoryQuery = z.infer<typeof myHistoryQuerySchema>;

export const teamHistoryQuerySchema = z.object({
  date: calendarDateSchema,
});
export type TeamHistoryQuery = z.infer<typeof teamHistoryQuerySchema>;
