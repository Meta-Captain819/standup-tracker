
import { IANAZone } from "luxon";
import { z } from "zod";

export const SUPPORTED_TIMEZONES = [
  "UTC",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Phoenix",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Bogota",
  "America/Lima",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Zurich",
  "Europe/Rome",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Europe/Athens",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Africa/Lagos",
  "Africa/Cairo",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Asia/Jerusalem",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Perth",
  "Australia/Sydney",
  "Pacific/Auckland",
  "Pacific/Honolulu",
] as const;

export type SupportedTimezone = (typeof SUPPORTED_TIMEZONES)[number];

const supported = new Set<string>(SUPPORTED_TIMEZONES);

for (const zone of SUPPORTED_TIMEZONES) {
  if (!IANAZone.isValidZone(zone)) {
    throw new Error(`ianaZones: "${zone}" is not a valid IANA timezone`);
  }
}

export function isSupportedTimezone(value: string): value is SupportedTimezone {
  return supported.has(value);
}

/** Reusable Zod schema for the `timezone` field — the single source used by every request schema. */
export const timezoneSchema = z
  .string()
  .refine(isSupportedTimezone, { message: "Unsupported or invalid timezone." });
