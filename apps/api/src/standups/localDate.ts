
import { DateTime } from "luxon";
import type { SupportedTimezone } from "../shared/ianaZones";

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
