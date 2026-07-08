import "server-only";
import { z, ZodError, type ZodType } from "zod";
import { env } from "@/app/_lib/env";
import { getSession } from "@/app/_lib/session/read";
import { updateSessionTokens, destroySession } from "@/app/_lib/session/write";
import { ApiError, ApiShapeError, SessionExpiredError, type ApiErrorBody } from "@/app/_lib/api/errors";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiFetchInit<T> {
  method?: HttpMethod;
  body?: unknown;
  /** Validated against the 2xx response body. Omit for endpoints with no response body (e.g. 204s). */
  schema?: ZodType<T>;
  accessToken?: string;
  searchParams?: Record<string, string | undefined>;
}

function buildUrl(path: string, searchParams?: Record<string, string | undefined>): string {
  const url = new URL(path, env.BACKEND_API_URL);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

const fallbackErrorBody: ApiErrorBody = {
  code: "INTERNAL_ERROR",
  message: "The server returned an unexpected response.",
  retryable: true,
};

/**
 * Forwards a request to Express and validates the response against the caller-supplied Zod
 * schema, so a backend response-shape drift throws loudly in dev instead of silently corrupting
 * the UI (see the "no shared schema package" gap in standup-tracker-frontend-plan.md).
 */
export async function apiFetch<T = void>(path: string, init: ApiFetchInit<T> = {}): Promise<T> {
  const { method = "GET", body, schema, accessToken, searchParams } = init;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(buildUrl(path, searchParams), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    const parsedBody: unknown = await response.json().catch(() => null);
    const errorBody =
      parsedBody && typeof parsedBody === "object" && "error" in parsedBody
        ? ((parsedBody as { error: ApiErrorBody }).error ?? fallbackErrorBody)
        : fallbackErrorBody;
    throw new ApiError(response.status, errorBody);
  }

  if (response.status === 204 || !schema) {
    return undefined as T;
  }

  const json: unknown = await response.json();
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ApiShapeError(path, result.error);
  }
  return result.data;
}

const refreshResponseSchema = z.object({ accessToken: z.string(), refreshToken: z.string() });

const ACCESS_TOKEN_EXPIRY_BUFFER_MS = 30_000;

/**
 * Attaches the session's access token, transparently refreshing it first if expired or about to
 * expire. If the refresh itself fails, the session cookie is destroyed and SessionExpiredError is
 * thrown so the calling route handler can respond appropriately.
 */
export async function authorizedApiFetch<T = void>(path: string, init: ApiFetchInit<T> = {}): Promise<T> {
  const session = await getSession();
  if (!session) {
    throw new SessionExpiredError();
  }

  let accessToken = session.accessToken;

  if (session.accessTokenExpiresAt - Date.now() < ACCESS_TOKEN_EXPIRY_BUFFER_MS) {
    try {
      const refreshed = await apiFetch("/auth/refresh", {
        method: "POST",
        body: { refreshToken: session.refreshToken },
        schema: refreshResponseSchema,
      });
      await updateSessionTokens(session, refreshed);
      accessToken = refreshed.accessToken;
    } catch (error) {
      if (error instanceof ZodError) throw error;
      await destroySession();
      throw new SessionExpiredError();
    }
  }

  return apiFetch(path, { ...init, accessToken });
}
