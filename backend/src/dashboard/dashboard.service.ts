// Dashboard read model — the lead/owner-admin team board (implementation plan Phase 1; architecture
// §2/§8/§18, CLAUDE §4/§6). A pure, tenant-scoped read: no writes, no AI (the board renders every real
// update independent of Insights — CLAUDE §7). Two views ride the same surface:
//
//   • the LIVE board — latest update per person, each labeled with that writer's own day/time, plus a
//     "posted for their current local day?" marker;
//   • the DATE-PICKER board — each person's update for a chosen past day, aligned to their personal
//     version of that date ("show me Monday" = each person's own Monday — architecture §8).
//
// A Tuesday card beside a Monday card is correct and never normalized. All day/date logic uses the
// writer's IANA zone via localDate.ts / the stored `localStandupDate`; none is re-derived here. Cross-
// module reads go through each module's service (roster via teams.listRoster, the per-day team gather via
// standups.getTeamStandupsForDate), never another module's data layer (CLAUDE §3); the latest-per-person
// query goes through the shared `forTeam` tenant wrapper over the `[userId, submittedAtUtc desc]` index.
import type { AuthContext } from "../auth/authenticate";
import { forTeam } from "../data-access";
import type { Prisma, Role } from "../generated/prisma/client";
import { isSupportedTimezone } from "../shared/ianaZones";
import { currentLocalDate } from "../standups/localDate";
import { getTeamStandupsForDate } from "../standups/standups.service";
import { listRoster, type MemberStatus } from "../teams/teams.service";

// One update as it appears on a board card: the verbatim text plus its derived day/markers and a derived
// `hasBlocker` signal so the (UI-less) API already carries what the board highlights. Text is returned
// verbatim — escaping on render is the frontend's job (out of scope). Labeled with the writer's own
// `localStandupDate`, `submittedAtUtc`, `timezone`, and `editedAt`.
export interface BoardStandup {
  id: string;
  yesterday: string;
  today: string;
  blockers: string;
  hasBlocker: boolean;
  submittedAtUtc: Date;
  localStandupDate: Date;
  timezone: string;
  editedAt: Date | null;
}

// Latest-update-per-person select over the `[userId, submittedAtUtc desc]` index. `userId` is selected to
// key the by-user map; it is dropped by `toBoardStandup`.
const boardStandupSelect = {
  id: true,
  userId: true,
  yesterday: true,
  today: true,
  blockers: true,
  submittedAtUtc: true,
  localStandupDate: true,
  timezone: true,
  editedAt: true,
} satisfies Prisma.StandupSelect;

// Structurally accepts both the latest-per-person row and `standups.TeamStandup` (each carries these
// fields; extra fields like `userId`/`user` are ignored), so one converter serves both views.
function toBoardStandup(row: {
  id: string;
  yesterday: string;
  today: string;
  blockers: string;
  submittedAtUtc: Date;
  localStandupDate: Date;
  timezone: string;
  editedAt: Date | null;
}): BoardStandup {
  return {
    id: row.id,
    yesterday: row.yesterday,
    today: row.today,
    blockers: row.blockers,
    hasBlocker: row.blockers.trim() !== "",
    submittedAtUtc: row.submittedAtUtc,
    localStandupDate: row.localStandupDate,
    timezone: row.timezone,
    editedAt: row.editedAt,
  };
}

// ── Live board ──────────────────────────────────────────────────────────────────────────────────────

export interface LiveBoardCard {
  userId: string;
  name: string;
  role: Role;
  status: MemberStatus;
  /** The member's current local date, or null when their zone is unknown (invited / never logged in). */
  currentLocalDate: Date | null;
  /** The member's most recent update ever, or null if they have never posted. */
  latest: BoardStandup | null;
  /** Whether `latest` is for the member's current local day — false surfaces "no update yet". */
  hasPostedToday: boolean;
}

export interface LiveBoard {
  view: "live";
  cards: LiveBoardCard[];
}

/**
 * The live board: latest update per person with "no update yet" markers computed against each member's
 * own current local day. The roster (active members, ordered by name) and the latest-per-person rows are
 * read concurrently and both tenant-scoped. A member with a null `timezone` has no resolvable local day,
 * so they surface as no-update-today, consistent with their `pending` roster status (architecture §8).
 */
export async function getLiveBoard(auth: AuthContext): Promise<LiveBoard> {
  const [roster, latestRows] = await Promise.all([
    listRoster(auth),
    // DISTINCT-ON-style latest-row lookup over the `[userId, submittedAtUtc desc]` index — never a
    // fetch-all-then-filter (CLAUDE §4).
    forTeam(auth.teamId).standup.findMany({
      orderBy: [{ userId: "asc" }, { submittedAtUtc: "desc" }],
      distinct: ["userId"],
      select: boardStandupSelect,
    }),
  ]);

  const latestByUser = new Map(latestRows.map((row) => [row.userId, row]));

  const cards = roster.map((member): LiveBoardCard => {
    const localDate =
      member.timezone !== null && isSupportedTimezone(member.timezone)
        ? currentLocalDate(member.timezone)
        : null;
    const row = latestByUser.get(member.id);
    const latest = row ? toBoardStandup(row) : null;
    const hasPostedToday =
      latest !== null &&
      localDate !== null &&
      latest.localStandupDate.getTime() === localDate.getTime();
    return {
      userId: member.id,
      name: member.name,
      role: member.role,
      status: member.status,
      currentLocalDate: localDate,
      latest,
      hasPostedToday,
    };
  });

  return { view: "live", cards };
}

// ── Date-picker board ───────────────────────────────────────────────────────────────────────────────

export interface DateBoardCard {
  userId: string;
  name: string;
  role: Role;
  status: MemberStatus;
  /** The member's update for the picked date (their personal version), or null. */
  standup: BoardStandup | null;
  hasUpdate: boolean;
}

export interface DateBoard {
  view: "date";
  date: Date;
  cards: DateBoardCard[];
}

/**
 * The board for a chosen past day. The per-day team read is delegated to
 * `standups.getTeamStandupsForDate` (already aligned on each writer's `localStandupDate`, so no date math
 * happens here), then left-joined against the roster to mark anyone with no update on their personal
 * version of that date. Both reads are tenant-scoped; run concurrently.
 */
export async function getDateBoard(auth: AuthContext, date: Date): Promise<DateBoard> {
  const [roster, dayStandups] = await Promise.all([
    listRoster(auth),
    getTeamStandupsForDate(auth, date),
  ]);

  const byUser = new Map(dayStandups.map((standup) => [standup.user.id, standup]));

  const cards = roster.map((member): DateBoardCard => {
    const row = byUser.get(member.id);
    const standup = row ? toBoardStandup(row) : null;
    return {
      userId: member.id,
      name: member.name,
      role: member.role,
      status: member.status,
      standup,
      hasUpdate: standup !== null,
    };
  });

  return { view: "date", date, cards };
}
