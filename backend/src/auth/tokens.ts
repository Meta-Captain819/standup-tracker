// Token primitives (auth plan Phase 1, deliverable 6; decisions §2.2–§2.4).
//
//   • Access token — short-lived HS256 JWT whose only claim is `sub = userId`. Team and role are
//     never carried in the token; they are re-resolved from the DB on every request (Golden Rule 5).
//   • Opaque tokens — high-entropy random secrets used as refresh, invite, and reset tokens. The raw
//     value leaves the process once; only its HMAC-SHA256 digest is ever persisted, and lookups are
//     by that unique digest (so no constant-time compare is needed in application code).
import { createHmac, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

// Lifetimes as named constants (auth plan §3): access ~15m, refresh ~30d, invite ~72h, reset ~1h.
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const INVITE_TOKEN_TTL_SECONDS = 72 * 60 * 60;
export const RESET_TOKEN_TTL_SECONDS = 60 * 60;

export function signAccessToken(userId: string): string {
  return jwt.sign({}, env.ACCESS_TOKEN_SECRET, {
    subject: userId,
    algorithm: "HS256",
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

/** Verify an access token and return its subject. Throws if invalid/expired/malformed. */
export function verifyAccessToken(token: string): { userId: string } {
  const payload = jwt.verify(token, env.ACCESS_TOKEN_SECRET, { algorithms: ["HS256"] });
  if (typeof payload === "string" || typeof payload.sub !== "string") {
    throw new Error("Malformed access token");
  }
  return { userId: payload.sub };
}

/** A 256-bit URL-safe opaque secret for refresh / invite / reset tokens. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

/** HMAC-SHA256 digest stored in place of a raw opaque token (never store the raw value). */
export function hashToken(rawToken: string): string {
  return createHmac("sha256", env.REFRESH_TOKEN_SECRET).update(rawToken).digest("hex");
}
