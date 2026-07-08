// Zod boundary validation (auth plan Phase 1, deliverable 3; Golden Rule 4).
//
// Called at the very top of every handler — `validate(schema, req.body)` — so nothing runs against
// an untrusted shape. On failure it throws a 400 AppError carrying flattened field errors (messages
// only, never the submitted values) for the terminal error handler to serialize.
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
