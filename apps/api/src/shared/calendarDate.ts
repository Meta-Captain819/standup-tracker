
import { z } from "zod";

export const calendarDateSchema = z.iso
  .date()
  .transform((value) => new Date(`${value}T00:00:00.000Z`));
