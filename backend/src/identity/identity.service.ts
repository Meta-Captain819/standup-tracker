// Identity & Access service — all auth domain logic (auth plan Phase 2/3).
//
// Pre-tenant lookups (user by email, token by hash, user by id) use the base `prisma` client because
// they are what ESTABLISH the tenant (decision §2.5). The one team-scoped read (/auth/me profile) goes
// through the tenant-scoping wrapper. Signup, invite-accept, and reset are wrapped in transactions so
// they never leave half-written state.
import type { AuthContext } from "../auth/authenticate";
import { hashPassword, verifyPassword } from "../auth/passwords";
import {
  type IssuedSession,
  issueSession,
  revokeAllSessionsForUser,
  revokeSession,
  rotateSession,
} from "../auth/session";
import {
  INVITE_TOKEN_TTL_SECONDS,
  RESET_TOKEN_TTL_SECONDS,
  generateOpaqueToken,
  hashToken,
} from "../auth/tokens";
import { env } from "../config/env";
import { forTeam } from "../data-access";
import { prisma } from "../db/prisma";
import { OnboardingTokenType, Prisma, Role } from "../generated/prisma/client";
import { enqueueEmail } from "../notifications/notifications.seam";
import { AppError } from "../shared/httpError";
import { provisionTeam } from "../teams/teams.service";
import type {
  AcceptInviteInput,
  ForgotPasswordInput,
  LoginInput,
  LogoutInput,
  RefreshInput,
  ResetPasswordInput,
  SignupInput,
} from "./identity.schemas";

// The only user fields ever returned to a client — never the password hash.
const userPublicSelect = {
  id: true,
  teamId: true,
  email: true,
  name: true,
  role: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof userPublicSelect }>;

export interface SessionResult extends IssuedSession {
  user: PublicUser;
}

export interface MeResponse {
  userId: string;
  teamId: string;
  role: Role;
  name: string;
  email: string;
}

function invalidCredentials(): AppError {
  return new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
}

function invalidToken(): AppError {
  return new AppError(400, "INVALID_TOKEN", "This link is invalid or has expired.");
}

function buildTokenUrl(path: string, rawToken: string): string {
  const url = new URL(path, env.WEB_APP_URL);
  url.searchParams.set("token", rawToken);
  return url.toString();
}

// Create a single-use, expiring, hashed onboarding token and return the raw value (which leaves the
// process exactly once — to the notifications seam). Accepts a tx client for atomic flows.
async function createOnboardingToken(
  userId: string,
  teamId: string,
  type: OnboardingTokenType,
  ttlSeconds: number,
  db: Prisma.TransactionClient = prisma,
): Promise<string> {
  const rawToken = generateOpaqueToken();
  await db.onboardingToken.create({
    data: {
      userId,
      teamId,
      type,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    },
  });
  return rawToken;
}

// ── Phase 2: session lifecycle ────────────────────────────────────────────────────────────────

/**
 * Create a team and its owner-admin, then issue the first session — all in one transaction. This is
 * the sole tenant-provisioning + owner-creation path (workflow "The owner starts the team").
 */
export async function signup(input: SignupInput): Promise<SessionResult> {
  const passwordHash = await hashPassword(input.password);

  try {
    const { user, session } = await prisma.$transaction(async (tx) => {
      const team = await provisionTeam(tx, { name: input.teamName });
      const createdUser = await tx.user.create({
        data: {
          teamId: team.id,
          name: input.name,
          email: input.email,
          passwordHash,
          role: Role.OWNER_ADMIN,
          timezone: input.timezone,
          isActive: true,
        },
        select: userPublicSelect,
      });
      const issued = await issueSession(createdUser.id, createdUser.teamId, tx);
      return { user: createdUser, session: issued };
    });

    return { ...session, user };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists.");
    }
    throw err;
  }
}

/**
 * Verify credentials and issue a session. Captures the writer's IANA zone on every login (architecture
 * §3/§8), writing only when it changed. Unknown email, wrong password, and inactive account all return
 * one generic error (no user enumeration).
 */
export async function login(input: LoginInput): Promise<SessionResult> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      teamId: true,
      email: true,
      name: true,
      role: true,
      passwordHash: true,
      isActive: true,
      timezone: true,
    },
  });

  if (!user || !user.isActive || user.passwordHash === null) {
    throw invalidCredentials();
  }

  if (!(await verifyPassword(user.passwordHash, input.password))) {
    throw invalidCredentials();
  }

  if (user.timezone !== input.timezone) {
    await prisma.user.update({ where: { id: user.id }, data: { timezone: input.timezone } });
  }

  const session = await issueSession(user.id, user.teamId);
  const publicUser: PublicUser = {
    id: user.id,
    teamId: user.teamId,
    email: user.email,
    name: user.name,
    role: user.role,
  };
  return { ...session, user: publicUser };
}

/** Rotate a refresh token into a fresh access + refresh pair (reuse revokes the chain). */
export function refresh(input: RefreshInput): Promise<IssuedSession> {
  return rotateSession(input.refreshToken);
}

/** Revoke a session (sign out). Idempotent. */
export async function logout(input: LogoutInput): Promise<void> {
  await revokeSession(input.refreshToken);
}

/** Resolve identity/team/role/name/email for the BFF. Team-scoped read via the tenant wrapper. */
export async function getProfile(auth: AuthContext): Promise<MeResponse> {
  const user = await forTeam(auth.teamId).user.findFirst({
    where: { id: auth.userId },
    select: { name: true, email: true },
  });
  if (!user) {
    throw new AppError(401, "UNAUTHENTICATED", "Your account is not active.");
  }
  return {
    userId: auth.userId,
    teamId: auth.teamId,
    role: auth.role,
    name: user.name,
    email: user.email,
  };
}

// ── Phase 3: onboarding & recovery tokens ─────────────────────────────────────────────────────

/**
 * Issue an invitation token for an already-created PENDING user and hand the link to notifications.
 * Exposed as a seam for the Teams "add member" flow (that endpoint lives in Teams & Membership, out of
 * scope); returns the raw token to the caller.
 */
export async function issueInviteToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, teamId: true, email: true },
  });
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found.");
  }

  const rawToken = await createOnboardingToken(
    user.id,
    user.teamId,
    OnboardingTokenType.INVITE,
    INVITE_TOKEN_TTL_SECONDS,
  );
  await enqueueEmail("invite", user.email, { url: buildTokenUrl("/invite/accept", rawToken) });
  return rawToken;
}

/**
 * Accept an invitation: set the password and activate the account, consuming the token atomically.
 * On any failure the account stays PENDING (passwordHash null). The invitee signs in afterward — that
 * is where their timezone is captured, so no session is issued here.
 */
export async function acceptInvite(input: AcceptInviteInput): Promise<{ user: PublicUser }> {
  const record = await prisma.onboardingToken.findUnique({
    where: { tokenHash: hashToken(input.token) },
  });
  if (!record || record.type !== OnboardingTokenType.INVITE) {
    throw invalidToken();
  }
  assertTokenUsable(record);

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    // Consume only if still unspent — guards a double-accept race.
    const consumed = await tx.onboardingToken.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw invalidToken();
    }
    return tx.user.update({
      where: { id: record.userId },
      data: { passwordHash, isActive: true },
      select: userPublicSelect,
    });
  });

  return { user };
}

/**
 * Begin password recovery. Always resolves the same way whether or not the email exists (no
 * enumeration); only a real, active, password-holding account actually receives a token.
 */
export async function requestPasswordReset(input: ForgotPasswordInput): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, teamId: true, email: true, isActive: true, passwordHash: true },
  });
  if (!user || !user.isActive || user.passwordHash === null) {
    return;
  }

  const rawToken = await createOnboardingToken(
    user.id,
    user.teamId,
    OnboardingTokenType.PASSWORD_RESET,
    RESET_TOKEN_TTL_SECONDS,
  );
  await enqueueEmail("password_reset", user.email, {
    url: buildTokenUrl("/reset-password", rawToken),
  });
}

/**
 * Complete password recovery: set the new password, consume the token, and revoke every existing
 * session — all atomically (CLAUDE §5; reset invalidates prior sessions).
 */
export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const record = await prisma.onboardingToken.findUnique({
    where: { tokenHash: hashToken(input.token) },
  });
  if (!record || record.type !== OnboardingTokenType.PASSWORD_RESET) {
    throw invalidToken();
  }
  assertTokenUsable(record);

  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction(async (tx) => {
    const consumed = await tx.onboardingToken.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw invalidToken();
    }
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await revokeAllSessionsForUser(record.userId, tx);
  });
}

// A token is usable only while unconsumed and unexpired.
function assertTokenUsable(record: { consumedAt: Date | null; expiresAt: Date }): void {
  if (record.consumedAt !== null || record.expiresAt <= new Date()) {
    throw invalidToken();
  }
}
