// Refresh-session lifecycle over the SessionRefreshToken model (auth plan Phase 1, deliverable 7;
// decision §2.3).
//
// Only the HMAC digest of a refresh token is stored; the access token stays stateless. Rotation on
// every refresh links the old row to its successor (`replacedById`) and revokes it. Presenting an
// already-rotated or revoked token is treated as reuse and revokes the whole chain for that user.
//
// These operations use the base `prisma` client, not the tenant-scoping wrapper: a refresh happens
// BEFORE the tenant is known — the token itself is what establishes identity/team. This is the
// sanctioned pre-tenant path (decision §2.5), and teamId is passed explicitly on issue.
import { prisma } from "../db/prisma";
import type { Prisma } from "../generated/prisma/client";
import { AppError } from "../shared/httpError";
import {
  REFRESH_TOKEN_TTL_SECONDS,
  generateOpaqueToken,
  hashToken,
  signAccessToken,
} from "./tokens";

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
}

function invalidRefreshToken(): AppError {
  return new AppError(401, "INVALID_REFRESH_TOKEN", "Your session is no longer valid.");
}

function refreshExpiry(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
}

/**
 * Issue a new access token + persisted refresh token. Accepts a transaction client so signup can
 * mint the first session atomically with team + owner creation.
 */
export async function issueSession(
  userId: string,
  teamId: string,
  db: Prisma.TransactionClient = prisma,
): Promise<IssuedSession> {
  const refreshToken = generateOpaqueToken();
  await db.sessionRefreshToken.create({
    data: { userId, teamId, tokenHash: hashToken(refreshToken), expiresAt: refreshExpiry() },
  });
  return { accessToken: signAccessToken(userId), refreshToken };
}

/**
 * Rotate a refresh token: verify it, revoke it, and issue a fresh access + refresh pair. Replaying a
 * token that was already rotated/revoked is reuse — the whole session chain is revoked and rejected.
 */
export async function rotateSession(rawRefreshToken: string): Promise<IssuedSession> {
  const tokenHash = hashToken(rawRefreshToken);
  const existing = await prisma.sessionRefreshToken.findUnique({ where: { tokenHash } });

  if (!existing) {
    throw invalidRefreshToken();
  }

  // Reuse detection: a revoked or already-succeeded token is being replayed → burn the chain.
  if (existing.revokedAt !== null || existing.replacedById !== null) {
    await revokeAllSessionsForUser(existing.userId);
    throw invalidRefreshToken();
  }

  if (existing.expiresAt <= new Date()) {
    throw invalidRefreshToken();
  }

  const refreshToken = generateOpaqueToken();

  await prisma.$transaction(async (tx) => {
    const successor = await tx.sessionRefreshToken.create({
      data: {
        userId: existing.userId,
        teamId: existing.teamId,
        tokenHash: hashToken(refreshToken),
        expiresAt: refreshExpiry(),
      },
    });
    // Conditional revoke guards against a concurrent rotation of the same token: whichever request
    // marks it first wins; the loser's count is 0 and its whole transaction (successor included)
    // rolls back.
    const marked = await tx.sessionRefreshToken.updateMany({
      where: { id: existing.id, revokedAt: null, replacedById: null },
      data: { revokedAt: new Date(), replacedById: successor.id },
    });
    if (marked.count !== 1) {
      throw invalidRefreshToken();
    }
  });

  return { accessToken: signAccessToken(existing.userId), refreshToken };
}

/** Revoke a single session by its raw refresh token. Idempotent — a no-op if already revoked/absent. */
export async function revokeSession(rawRefreshToken: string): Promise<void> {
  await prisma.sessionRefreshToken.updateMany({
    where: { tokenHash: hashToken(rawRefreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revoke every active session for a user (password reset, refresh-token reuse). */
export async function revokeAllSessionsForUser(
  userId: string,
  db: Prisma.TransactionClient = prisma,
): Promise<void> {
  await db.sessionRefreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
