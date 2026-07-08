import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** Mirrors Express's exact error envelope (backend/src/shared/httpError.ts). */
export interface ApiErrorBody {
  code: string;
  message: string;
  retryable: boolean;
  details?: unknown;
}

/** A non-2xx response from Express, normalized to its own envelope shape. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.retryable = body.retryable;
    this.details = body.details;
  }
}

/** A 2xx response from Express whose body didn't match the caller-supplied Zod schema. */
export class ApiShapeError extends Error {
  constructor(path: string, cause: ZodError) {
    super(`Response from ${path} did not match the expected shape: ${cause.message}`);
    this.name = "ApiShapeError";
  }
}

/** The session's refresh token was rejected by Express; the session cookie has been destroyed. */
export class SessionExpiredError extends Error {
  constructor() {
    super("Session expired.");
    this.name = "SessionExpiredError";
  }
}

export function toRouteResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json<{ error: ApiErrorBody }>(
      { error: { code: error.code, message: error.message, retryable: error.retryable, details: error.details } },
      { status: error.status },
    );
  }

  if (error instanceof SessionExpiredError) {
    return NextResponse.json<{ error: ApiErrorBody }>(
      { error: { code: "SESSION_EXPIRED", message: error.message, retryable: false } },
      { status: 401 },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json<{ error: ApiErrorBody }>(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "The request body failed validation.",
          retryable: false,
          details: error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  console.error(error);
  return NextResponse.json<{ error: ApiErrorBody }>(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong.", retryable: true } },
    { status: 500 },
  );
}
