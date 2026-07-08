
import { z } from "zod";
import { calendarDateSchema } from "../shared/calendarDate";

export const boardQuerySchema = z.object({
  date: calendarDateSchema.optional(),
});
export type BoardQuery = z.infer<typeof boardQuerySchema>;
