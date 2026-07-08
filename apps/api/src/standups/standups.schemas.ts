
import { z } from "zod";
import { timezoneSchema } from "../shared/ianaZones";

const answer = z.string().max(5000);


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


export const standupIdParamsSchema = z.object({ id: z.cuid() });
export type StandupIdParams = z.infer<typeof standupIdParamsSchema>;

export const todayQuerySchema = z.object({ timezone: timezoneSchema });
export type TodayQuery = z.infer<typeof todayQuerySchema>;
