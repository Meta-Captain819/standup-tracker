
import { z } from "zod";
import { AppError } from "./httpError";

export function validate<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(400, "VALIDATION_ERROR", "One or more fields are invalid.", {
      retryable: false,
      details: z.flattenError(result.error),
    });
  }
  return result.data;
}
