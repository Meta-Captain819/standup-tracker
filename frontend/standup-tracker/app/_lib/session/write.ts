import "server-only";
import { cookies } from "next/headers";
import { encryptSession, type SessionPayload } from "@/app/_lib/session/crypto";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/app/_lib/session/constants";
import type { SessionResult } from "@/app/_lib/types/user";

/** Access tokens are 15-minute JWTs (backend/src/auth/tokens.ts) — captured as an absolute expiry. */
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await encryptSession(payload);
  (await cookies()).set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function createSession(sessionResult: SessionResult): Promise<void> {
  await setSessionCookie({
    userId: sessionResult.user.id,
    teamId: sessionResult.user.teamId,
    role: sessionResult.user.role,
    name: sessionResult.user.name,
    email: sessionResult.user.email,
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
  (await cookies()).delete(SESSION_COOKIE_NAME);
}
