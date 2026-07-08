
import type { NextFunction, Request, Response } from "express";
import { Prisma } from "../generated/prisma/client";

interface AppErrorOptions {
  /** Overrides the status-derived default (5xx and 429 are retryable). */
  retryable?: boolean;
  /** Safe, client-facing detail (e.g. Zod field errors) — never secrets or PII. */
  details?: unknown;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, options?: AppErrorOptions) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.retryable = options?.retryable ?? (status >= 500 || status === 429);
    this.details = options?.details;
  }
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) {
    return err;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        return new AppError(409, "CONFLICT", "This resource already exists.");
      case "P2025":
        return new AppError(404, "NOT_FOUND", "The requested resource was not found.");
      default:
        return new AppError(500, "INTERNAL_ERROR", "An unexpected error occurred.");
    }
  }
  return new AppError(500, "INTERNAL_ERROR", "An unexpected error occurred.");
}

/** Terminal error handler — must be registered last, with all four args (Express marks it by arity). */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) {
    return;
  }

  const error = toAppError(err);

  if (error.status >= 500) {
    console.error("[error]", err);
  }

  const body: { error: { code: string; message: string; retryable: boolean; details?: unknown } } = {
    error: { code: error.code, message: error.message, retryable: error.retryable },
  };
  if (error.details !== undefined) {
    body.error.details = error.details;
  }

  res.status(error.status).json(body);
}
