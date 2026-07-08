import "server-only";
import { cookies } from "next/headers";
import { encryptSession, type SessionPayload } from "@/app/_lib/session/crypto";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/app/_lib/session/constants";
import type { SessionResult } from "@/app/_lib/types/user";

/** Access tokens are 15-minute JWTs (backend/src/auth/tokens.ts) — captured as an absolute expiry. */
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await encryptSession(payload);
  try {
    (await cookies()).set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  } catch (error) {
    // Next.js throws an error if trying to modify cookies in a Server Component.
    // We swallow it here so the refresh request can still succeed for the current render.
    console.warn("Failed to update session cookie (likely called from a Server Component).");
  }
}

export async function createSession(sessionResult: SessionResult, timezone: string): Promise<void> {
  await setSessionCookie({
    userId: sessionResult.user.id,
    teamId: sessionResult.user.teamId,
    role: sessionResult.user.role,
    name: sessionResult.user.name,
    email: sessionResult.user.email,
    timezone,
    accessToken: sessionResult.accessToken,
    accessTokenExpiresAt: Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000,
    refreshToken: sessionResult.refreshToken,
  });
}

export async function updateSessionTokens(
  current: SessionPayload,
  tokens: { accessToken: string; refreshToken: string },
): Promise<void> {
  await setSessionCookie({
    ...current,
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000,
    refreshToken: tokens.refreshToken,
  });
}

export async function destroySession(): Promise<void> {
  try {
    (await cookies()).delete(SESSION_COOKIE_NAME);
  } catch (error) {
    // Next.js throws an error if trying to modify cookies in a Server Component.
    console.warn("Failed to delete session cookie (likely called from a Server Component).");
  }
}
