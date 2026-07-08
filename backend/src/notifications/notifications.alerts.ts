// Lead blocker alert evaluation + dispatch (implementation plan Phase 6; architecture §9/§12, workflow
// "Nudges and alerts"). Surfaces new and persistent blockers to a team's leads/admins as a durable in-app
// notification and a queued email (Phase 4), plus an instant live push when a lead has the board open
// (Phase 3). `alertLeadsForBlocker` is the shared core used by both:
//
//   • the live-on-submit path — standups.service calls it right after a standup with a blocker commits,
//     so a connected lead sees it instantly;
//   • the scheduler's per-day sweep (`runBlockerAlertsTick`, called from the Phase 5 scheduler tick) —
//     which catches any blocker the live path missed (no lead connected, a transient failure, etc.).
//
// Both share exactly one `dedupeKey = blocker:${standupId}:${recipientUserId}`, so the scheduler's later
// pass for a standup the live path already alerted is a pure no-op (CLAUDE §9).
import type { AuthContext } from "../auth/authenticate";
import { forTeam, type TenantClient } from "../data-access";
import { NotificationType, Role } from "../generated/prisma/client";
import { isSupportedTimezone } from "../shared/ianaZones";
import { currentLocalDate } from "../standups/localDate";
import { listRoster, type RosterMember } from "../teams/teams.service";
import { buildBlockerAlertMessage } from "./notifications.messages";
import { notify } from "./notifications.service";

// See notifications.reminders.ts — the scheduler has no real caller session; `listRoster` only reads
// `auth.teamId`, so userId/role are unused placeholders for this off-request read.
function systemAuth(teamId: string): AuthContext {
  return { teamId, userId: "system", role: Role.OWNER_ADMIN };
}

export interface BlockerStandup {
  id: string;
  userId: string;
  blockers: string;
  localStandupDate: Date;
}

// A blocker "persists" once it has shown up on this many consecutive local days for the same member
// (today plus at least one immediately preceding day), matching the AI Insights persistence rule
// (architecture §11).
const PERSISTENT_BLOCKER_MIN_DAYS = 2;
// A short, indexed lookback — enough to detect a short streak without an unbounded history scan.
const LOOKBACK_ROWS = 5;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a member's blocker has persisted across `PERSISTENT_BLOCKER_MIN_DAYS`+ consecutive local days,
 * via a short indexed read over their recent standups (`[userId, submittedAtUtc desc]`). Consecutive
 * `localStandupDate` values always differ by exactly one UTC day regardless of the member's DST, since
 * each is stored pinned to UTC midnight (standups/localDate.ts) — safe integer-day arithmetic, no
 * timezone math needed here.
 */
async function isPersistentBlocker(
  db: TenantClient,
  userId: string,
  latestLocalDate: Date,
): Promise<boolean> {
  const recent = await db.standup.findMany({
    where: { userId },
    orderBy: { submittedAtUtc: "desc" },
    take: LOOKBACK_ROWS,
    select: { blockers: true, localStandupDate: true },
  });

  let streak = 0;
  let expected = latestLocalDate.getTime();
  for (const row of recent) {
    if (row.localStandupDate.getTime() !== expected || row.blockers.trim() === "") {
      break;
    }
    streak += 1;
    expected -= ONE_DAY_MS;
  }
  return streak >= PERSISTENT_BLOCKER_MIN_DAYS;
}

/**
 * Alert a team's leads/admins about one standup's blocker — a no-op if it has no blocker or the team has
 * no lead/admin recipients. The blocked member is never alerted about their own update even if they hold
 * a lead/admin role. Accepts an optional pre-fetched roster so the scheduler's per-member sweep
 * (`runBlockerAlertsTick`) avoids a redundant `listRoster` call per standup.
 */
export async function alertLeadsForBlocker(
  teamId: string,
  standup: BlockerStandup,
  preloadedRoster?: RosterMember[],
): Promise<void> {
  if (standup.blockers.trim() === "") {
    return;
  }

  const roster = preloadedRoster ?? (await listRoster(systemAuth(teamId)));
  const recipients = roster.filter(
    (member) =>
      (member.role === Role.LEAD || member.role === Role.OWNER_ADMIN) && member.id !== standup.userId,
  );
  if (recipients.length === 0) {
    return;
  }

  const memberName = roster.find((member) => member.id === standup.userId)?.name ?? "A teammate";
  const persistent = await isPersistentBlocker(forTeam(teamId), standup.userId, standup.localStandupDate);
  const content = buildBlockerAlertMessage({ memberName, blockers: standup.blockers, persistent });

  for (const recipient of recipients) {
    await notify(teamId, {
      userId: recipient.id,
      type: NotificationType.BLOCKER_ALERT,
      dedupeKey: `blocker:${standup.id}:${recipient.id}`,
      content,
      email: recipient.email,
    });
  }
}

/**
 * Scan a team's current-local-day standups for a non-empty blocker and alert leads/admins for each
 * (implementation plan Phase 6). Skips entirely when the team has no lead/admin recipient. A no-op for any
 * standup the live-on-submit path already alerted (same `dedupeKey`).
 */
export async function runBlockerAlertsTick(teamId: string): Promise<void> {
  const roster = await listRoster(systemAuth(teamId));
  const hasRecipients = roster.some(
    (member) => member.role === Role.LEAD || member.role === Role.OWNER_ADMIN,
  );
  if (!hasRecipients) {
    return;
  }

  const db = forTeam(teamId);
  for (const member of roster) {
    if (member.timezone === null || !isSupportedTimezone(member.timezone)) {
      continue;
    }
    const localDate = currentLocalDate(member.timezone);
    const standup = await db.standup.findFirst({
      where: { userId: member.id, localStandupDate: localDate },
      select: { id: true, userId: true, blockers: true, localStandupDate: true },
    });
    if (!standup) {
      continue;
    }
    await alertLeadsForBlocker(teamId, standup, roster);
  }
}
