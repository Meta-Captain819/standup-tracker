// Standups module (implementation plan Phase 4/5; Architecture §2/§8, CLAUDE §6/§8/§9).
//
// A standup's day belongs to its writer: every write derives `localStandupDate` from the exact UTC
// instant + the writer's IANA zone via `./localDate`, never server time or manual offsets. All reads
// and writes go through the tenant-scoping wrapper (`forTeam`) and are further scoped to the caller's
// own user id, so a member only ever touches their own updates.
import type { AuthContext } from "../auth/authenticate";
import { forTeam } from "../data-access";
import type { Prisma } from "../generated/prisma/client";
import { alertLeadsForBlocker } from "../notifications/notifications.alerts";
import { publishBoardEvent } from "../realtime/realtime.hub";
import { AppError } from "../shared/httpError";
import type { SupportedTimezone } from "../shared/ianaZones";
import { currentLocalDate, deriveLocalStandupDate } from "./localDate";
import type { SubmitStandupInput } from "./standups.schemas";

// The fields returned for a caller's own update — everything they wrote plus its derived day/markers.
// Exported so the History module returns the caller's own timeline in exactly this shape (its paginated
// read is the full-history extension of `getMyRecent`), keeping one source of shape (CLAUDE §7).
export const standupSelect = {
  id: true,
  yesterday: true,
  today: true,
  blockers: true,
  submittedAtUtc: true,
  timezone: true,
  localStandupDate: true,
  editedAt: true,
} satisfies Prisma.StandupSelect;

export type StandupResult = Prisma.StandupGetPayload<{ select: typeof standupSelect }>;

// The caller's most recent updates (one row per local day) shown on their home screen.
const RECENT_STANDUP_LIMIT = 7;

/**
 * Push a board-freshness event to the team's connected leads/admins (implementation plan Phase 3). Called
 * AFTER the write commits and wrapped so a realtime failure can never fail or delay the standup write
 * (Golden Rules 8/9 — never lose an update; side effects off the critical path). The publish is in-process
 * and best-effort; the board stays authoritative via the Phase 1 read model regardless.
 */
function publishBoardFreshness(auth: AuthContext, standup: StandupResult): void {
  try {
    publishBoardEvent(auth.teamId, {
      userId: auth.userId,
      localStandupDate: standup.localStandupDate,
    });
  } catch {
    console.warn(`[standups] board freshness publish failed team=${auth.teamId}`);
  }
}

/**
 * Fire the live-on-submit blocker alert (implementation plan Phase 6) — when the write has a non-empty
 * blocker, a team's leads/admins are notified right then, instantly pushed to any connected lead and
 * durably stored, so the scheduler's later sweep is a no-op for it (same `dedupeKey`). Called AFTER the
 * write commits and never awaited by the caller: `alertLeadsForBlocker` does its own async DB/email work,
 * which must never delay or fail the standup write (Golden Rules 8/9).
 */
function dispatchBlockerAlert(auth: AuthContext, standup: StandupResult): void {
  alertLeadsForBlocker(auth.teamId, {
    id: standup.id,
    userId: auth.userId,
    blockers: standup.blockers,
    localStandupDate: standup.localStandupDate,
  }).catch(() => {
    console.warn(`[standups] blocker alert dispatch failed team=${auth.teamId}`);
  });
}

/**
 * Accept the three-question update as an idempotent, atomic, writer-local-day write. The instant is
 * captured now, the local day is derived in the writer's zone, and the row is upserted on
 * `(userId, localStandupDate)` — so a retried submit reconciles onto the existing row instead of
 * duplicating (CLAUDE §8). The writer's last-known zone is refreshed in the same transaction.
 */
export async function submitStandup(
  auth: AuthContext,
  input: SubmitStandupInput,
): Promise<StandupResult> {
  const submittedAtUtc = new Date();
  const localStandupDate = deriveLocalStandupDate(submittedAtUtc, input.timezone);
  const db = forTeam(auth.teamId);

  const [, standup] = await db.$transaction([
    db.user.update({
      where: { id: auth.userId },
      data: { timezone: input.timezone },
      select: { id: true },
    }),
    db.standup.upsert({
      where: { userId_localStandupDate: { userId: auth.userId, localStandupDate } },
      create: {
        teamId: auth.teamId,
        userId: auth.userId,
        yesterday: input.yesterday,
        today: input.today,
        blockers: input.blockers,
        submittedAtUtc,
        timezone: input.timezone,
        localStandupDate,
      },
      update: {
        yesterday: input.yesterday,
        today: input.today,
        blockers: input.blockers,
        submittedAtUtc,
        timezone: input.timezone,
      },
      select: standupSelect,
    }),
  ]);

  publishBoardFreshness(auth, standup);
  dispatchBlockerAlert(auth, standup);
  return standup;
}

/**
 * Edit the caller's own update, permitted only while their current local day (computed live in their
 * zone) still equals the update's stored `localStandupDate`; once their day has rolled over the update
 * is read-only history (CLAUDE §6). A successful edit keeps the latest text and stamps `editedAt`; the
 * original `submittedAtUtc`, `timezone`, and `localStandupDate` (its provenance) are preserved.
 */
export async function editStandup(
  auth: AuthContext,
  id: string,
  input: SubmitStandupInput,
): Promise<StandupResult> {
  const db = forTeam(auth.teamId);

  const existing = await db.standup.findFirst({
    where: { id, userId: auth.userId },
    select: { localStandupDate: true },
  });
  if (!existing) {
    throw new AppError(404, "STANDUP_NOT_FOUND", "Update not found.");
  }

  if (currentLocalDate(input.timezone).getTime() !== existing.localStandupDate.getTime()) {
    throw new AppError(
      409,
      "EDIT_WINDOW_CLOSED",
      "This update belongs to a past day and can no longer be edited.",
    );
  }

  const [, standup] = await db.$transaction([
    db.user.update({
      where: { id: auth.userId },
      data: { timezone: input.timezone },
      select: { id: true },
    }),
    db.standup.update({
      where: { id },
      data: {
        yesterday: input.yesterday,
        today: input.today,
        blockers: input.blockers,
        editedAt: new Date(),
      },
      select: standupSelect,
    }),
  ]);

  publishBoardFreshness(auth, standup);
  dispatchBlockerAlert(auth, standup);
  return standup;
}

/** The caller's update for their current local day (in `zone`), or null if they have not posted yet. */
export function getMyToday(
  auth: AuthContext,
  zone: SupportedTimezone,
): Promise<StandupResult | null> {
  return forTeam(auth.teamId).standup.findFirst({
    where: { userId: auth.userId, localStandupDate: currentLocalDate(zone) },
    select: standupSelect,
  });
}

/** The caller's most recent updates, newest first, via the per-user `[userId, submittedAtUtc desc]` index. */
export function getMyRecent(auth: AuthContext): Promise<StandupResult[]> {
  return forTeam(auth.teamId).standup.findMany({
    where: { userId: auth.userId },
    orderBy: { submittedAtUtc: "desc" },
    take: RECENT_STANDUP_LIMIT,
    select: standupSelect,
  });
}

// The shape the AI Insights module grounds on: each writer's real name plus their verbatim update. The
// name is required so a grounded summary can speak real names (CLAUDE §8); the text is carried verbatim
// and stays untrusted at the AI boundary. Read team-wide via the tenant wrapper over the
// `[teamId, localStandupDate]` index — never a scan-and-filter.
const teamStandupSelect = {
  id: true,
  yesterday: true,
  today: true,
  blockers: true,
  submittedAtUtc: true,
  timezone: true,
  localStandupDate: true,
  editedAt: true,
  user: { select: { id: true, name: true } },
} satisfies Prisma.StandupSelect;

export type TeamStandup = Prisma.StandupGetPayload<{ select: typeof teamStandupSelect }>;

/**
 * Every team member's update for one already-resolved local calendar date, tenant-scoped and ordered
 * deterministically by user id. The AI Insights module consumes this for grounding (cross-module reads
 * go through a module's own service, never its data layer — CLAUDE §3). Per-person local-day alignment
 * is resolved upstream: the caller passes the resolved `localStandupDate`, so this does no date math.
 */
export function getTeamStandupsForDate(
  auth: AuthContext,
  localStandupDate: Date,
): Promise<TeamStandup[]> {
  return forTeam(auth.teamId).standup.findMany({
    where: { localStandupDate },
    orderBy: { userId: "asc" },
    select: teamStandupSelect,
  });
}
