// Writer-local-day resolution — the single home for the highest-risk logic in the product
// (CLAUDE §6; implementation plan Phase 3). A standup's day belongs to its writer: it is the calendar
// date of the exact UTC submission instant, read in the writer's IANA zone. Every day/date decision
// downstream (uniqueness, the edit window, "no update yet") derives from these two functions and never
// does day math without the writer's zone in hand.
//
// Built on Luxon: all conversions are timezone-aware (no manual offset arithmetic), and no zone is
// assumed DST-free — Berlin and San Francisco shift, Karachi does not, and the library handles all
// three. Inputs are already-validated `SupportedTimezone` values (the IANA name, never a stored offset).
import { DateTime } from "luxon";
import type { SupportedTimezone } from "../shared/ianaZones";

// A `localStandupDate` is a pure calendar date. We represent it as a JS Date pinned to UTC midnight so
// Prisma's `@db.Date` column stores exactly that date regardless of the server's own zone.
function calendarDateAsUtcMidnight(local: DateTime): Date {
  return new Date(Date.UTC(local.year, local.month - 1, local.day));
}

/**
 * The calendar date of `submittedAtUtc` in the writer's zone — the `localStandupDate` value everything
 * hinges on. At one instant this is Tuesday in `Asia/Karachi` and Monday in `America/Los_Angeles`, and
 * both are correct.
 */
export function deriveLocalStandupDate(submittedAtUtc: Date, zone: SupportedTimezone): Date {
  return calendarDateAsUtcMidnight(DateTime.fromJSDate(submittedAtUtc, { zone }));
}

/**
 * The writer's current local date, computed live in their zone — used for the edit-window check
 * (an update is editable only while this equals its stored `localStandupDate`).
 */
export function currentLocalDate(zone: SupportedTimezone): Date {
  return calendarDateAsUtcMidnight(DateTime.now().setZone(zone));
}
