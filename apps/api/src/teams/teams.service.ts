
import type { AuthContext } from "../auth/authenticate";
import { forTeam, type TenantClient } from "../data-access";
import { Prisma, Role } from "../generated/prisma/client";
import { issueInviteToken } from "../identity/identity.service";
import { AppError } from "../shared/httpError";
import type { AddMemberInput, SetRoleInput } from "./teams.schemas";

export interface ProvisionTeamInput {
  name: string;
}

export function provisionTeam(db: Prisma.TransactionClient, input: ProvisionTeamInput) {
  return db.team.create({ data: { name: input.name } });
}


const rosterMemberSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  timezone: true,
  passwordHash: true,
} satisfies Prisma.UserSelect;

export type MemberStatus = "pending" | "active";

export interface RosterMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Last-known IANA zone; null until the member's first login refresh — an invited member has none. */
  timezone: string | null;
  /** PENDING until the invited member accepts and sets their password (passwordHash still null). */
  status: MemberStatus;
}

function toRosterMember(
  row: Prisma.UserGetPayload<{ select: typeof rosterMemberSelect }>,
): RosterMember {
  const { passwordHash, ...rest } = row;
  return { ...rest, status: passwordHash === null ? "pending" : "active" };
}

async function assertNotLastOwnerAdmin(db: TenantClient, excludingUserId: string): Promise<void> {
  const remainingOwners = await db.user.count({
    where: { role: Role.OWNER_ADMIN, isActive: true, id: { not: excludingUserId } },
  });
  if (remainingOwners === 0) {
    throw new AppError(
      409,
      "LAST_OWNER_ADMIN",
      "The team must always have at least one owner-admin.",
    );
  }
}

/**
 * Create a PENDING member in the caller's team and send its invite. The user is created with role
 * MEMBER and a null passwordHash, so login stays blocked until they accept the invite and set a
 * password. `issueInviteToken` mints the single-use hashed token and hands the link to notifications
 * off the request path. A duplicate email raises Prisma P2002, normalized to 409 by the error handler.
 */
export async function addMember(auth: AuthContext, input: AddMemberInput): Promise<RosterMember> {
  const created = await forTeam(auth.teamId).user.create({
    data: {
      teamId: auth.teamId,
      name: input.name,
      email: input.email,
      role: Role.MEMBER,
      passwordHash: null,
      isActive: true,
    },
    select: rosterMemberSelect,
  });
  await issueInviteToken(created.id);
  return toRosterMember(created);
}

/** The active roster of the caller's team, scoped by `forTeam` over the `[teamId, isActive]` index. */
export async function listRoster(auth: AuthContext): Promise<RosterMember[]> {
  const members = await forTeam(auth.teamId).user.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: rosterMemberSelect,
  });
  return members.map(toRosterMember);
}

/**
 * Promote or demote a member between LEAD and MEMBER. Because `authenticate` re-resolves role from the
 * DB on every request, the change takes effect on the target's very next call — no extra invalidation.
 * Demoting the last owner-admin is refused so the team can never be orphaned.
 */
export async function setRole(
  auth: AuthContext,
  targetUserId: string,
  role: SetRoleInput["role"],
): Promise<RosterMember> {
  const db = forTeam(auth.teamId);
  const target = await db.user.findFirst({
    where: { id: targetUserId, isActive: true },
    select: { id: true, role: true },
  });
  if (!target) {
    throw new AppError(404, "MEMBER_NOT_FOUND", "Member not found.");
  }
  if (target.role === Role.OWNER_ADMIN) {
    await assertNotLastOwnerAdmin(db, target.id);
  }

  const updated = await db.user.update({
    where: { id: targetUserId },
    data: { role },
    select: rosterMemberSelect,
  });
  return toRosterMember(updated);
}

/**
 * Remove a member by soft-deactivation (`isActive = false`) — never a hard delete, so their past
 * standups remain in team history (`Standup.onDelete: Restrict`). The removed user fails
 * `authenticate`'s active check on their very next request. Removing the last owner-admin is refused.
 */
export async function removeMember(auth: AuthContext, targetUserId: string): Promise<void> {
  const db = forTeam(auth.teamId);
  const target = await db.user.findFirst({
    where: { id: targetUserId },
    select: { id: true, role: true, isActive: true },
  });
  if (!target || !target.isActive) {
    throw new AppError(404, "MEMBER_NOT_FOUND", "Member not found.");
  }
  if (target.role === Role.OWNER_ADMIN) {
    await assertNotLastOwnerAdmin(db, target.id);
  }

  await db.user.update({ where: { id: targetUserId }, data: { isActive: false } });
}
