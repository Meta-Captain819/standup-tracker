
/**
 * Shared primitives for the scheduler's per-team ticks (reminders, blocker alerts). Each member's
 * "current local day" standup is looked up for the whole roster in ONE indexed read over
 * `[teamId, localStandupDate]`, then matched in memory by this key — never a query per member.
 */

/** Stable identity of a member's update on a given local day: `${userId}:${utcMidnightMillis}`. */
export function standupKey(userId: string, localStandupDate: Date): string {
  return `${userId}:${localStandupDate.getTime()}`;
}

/** The distinct local dates across a set of candidates, for a single `localStandupDate IN (...)` read. */
export function distinctLocalDates(dates: Date[]): Date[] {
  const byTime = new Map<number, Date>();
  for (const date of dates) {
    byTime.set(date.getTime(), date);
  }
  return [...byTime.values()];
}
