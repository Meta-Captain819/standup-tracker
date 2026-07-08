import { z } from "zod";
import { timezoneSchema } from "@/app/_lib/validation/timezones";

const answer = z.string().max(5000);

export const standupInputSchema = z
  .object({
    yesterday: answer,
    today: answer,
    blockers: answer,
    timezone: timezoneSchema,
  })
  .refine(
    (value) =>
      value.yesterday.trim() !== "" ||
      value.today.trim() !== "" ||
      value.blockers.trim() !== "",
    { message: "Fill in at least one field.", path: ["yesterday"] },
  );

export type StandupInput = z.infer<typeof standupInputSchema>;

