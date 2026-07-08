// History module — backward browsing of past days (implementation plan Phase 2; architecture §2/§15,
// workflow "Looking back: history and tracking"). Read-only: the edit window stays owned by `standups`
// and is untouched here. Two surfaces:
//
//   • the caller's own paginated timeline — the full-history extension of `standups.getMyRecent` (which
//     caps at 7 for the home screen), read through the shared `forTeam` wrapper over the
//     `[userId, submittedAtUtc desc]` index and scoped to the caller's own user id;
//   • the whole team's board for a chosen past day — delegated to `dashboard.getDateBoard`, so per-person
//     date alignment and "no update yet" logic live in exactly one place (no duplicated tz logic — CLAUDE §3).
//
// Because reads pass through `forTeam`, a removed (soft-deactivated) member's past updates still appear in
// the team's history (`Standup.onDelete: Restrict`) — the documented behavior (workflow "Remove people").
import type { AuthContext } from "../auth/authenticate";
import { forTeam } from "../data-access";
import { getDateBoard, type DateBoard } from "../dashboard/dashboard.service";
import { standupSelect, type StandupResult } from "../standups/standups.service";

// A bounded page size for the timeline — pagination is by design (architecture §15), never an unbounded read.
const PAGE_SIZE = 20;

export interface HistoryPage {
  items: StandupResult[];
  /** The cursor to fetch the next (older) page, or null when this is the last page. */
  nextCursor: string | null;
}

/**
 * The caller's own update timeline, newest first, cursor-paginated over the `[userId, submittedAtUtc desc]`
 * index and scoped to their own user id under `forTeam`. Fetches one extra row to detect whether a further
 * page exists; the cursor is the id of the last returned row (skipped on the next call).
 */
export async function getMyHistory(auth: AuthContext, cursor?: string): Promise<HistoryPage> {
  const rows = await forTeam(auth.teamId).standup.findMany({
    where: { userId: auth.userId },
    orderBy: { submittedAtUtc: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: standupSelect,
  });

  const hasMore = rows.length > PAGE_SIZE;
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? last.id : null;
  return { items, nextCursor };
}

/**
 * The whole team's board for a chosen past day — delegated to the dashboard's date-picker read model so
 * per-person date alignment and "no update yet" markers are computed in exactly one place. "Last Monday"
 * resolves to each person's own Monday for free, since rows are keyed on `localStandupDate`.
 */
export function getTeamHistoryForDate(auth: AuthContext, date: Date): Promise<DateBoard> {
  return getDateBoard(auth, date);
}
