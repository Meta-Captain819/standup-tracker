export const SESSION_COOKIE_NAME = "standup_session";

/** Mirrors the Express refresh-token TTL (backend/src/auth/tokens.ts). */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
