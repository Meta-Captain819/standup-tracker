import { z } from "zod";

export const calendarDateStringSchema = z.iso.date();
export type CalendarDateString = z.infer<typeof calendarDateStringSchema>;

