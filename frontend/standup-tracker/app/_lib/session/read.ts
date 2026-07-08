import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decryptSession, type SessionPayload } from "@/app/_lib/session/crypto";
import { SESSION_COOKIE_NAME } from "@/app/_lib/session/constants";

/** Memoized per request so repeated calls across a render pass don't re-decrypt the cookie. */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const cookieValue = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!cookieValue) return null;
  return decryptSession(cookieValue);
});

/**
 * The real, non-optimistic gate. proxy.ts performs the same check as a UX shortcut, but this is
 * the one that actually guards rendering — it must never be skipped by a layout/page that needs auth.
 *
 * Server Components have no reliable access to their own request pathname, so unlike proxy.ts
 * (which does), this redirect omits `?next=`. In practice proxy handles the `next` redirect for the
 * common case; this is the defense-in-depth fallback if proxy is ever bypassed or misconfigured.
 */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    redirect("/signin");
  }
  return session;
}
