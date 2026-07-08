
import type { AuthContext } from "../auth/authenticate";
import { forTeam } from "../data-access";
import type { Prisma, Role } from "../generated/prisma/client";
import { isSupportedTimezone } from "../shared/ianaZones";
import { currentLocalDate } from "../standups/localDate";
import { getTeamStandupsForDate } from "../standups/standups.service";
import { listRoster, type MemberStatus } from "../teams/teams.service";

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
