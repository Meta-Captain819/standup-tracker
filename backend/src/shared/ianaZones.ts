// Supported IANA timezone allow-list (auth plan Phase 1, deliverable 4; CLAUDE §6/§7, architecture §7).
//
// The timezone field is captured automatically from the browser (Intl API) — never configured — and
// validated against this known set, never accepted freeform. Every entry is asserted to be a real
// zone via Luxon at module load, so a typo here fails fast rather than silently rejecting users.
import { IANAZone } from "luxon";
import { z } from "zod";

// Curated set covering the team's home zones (Karachi, Berlin, San Francisco) plus the widely used
// zones a distributed team may sign in from. Broad enough not to reject a legitimate user, bounded
// enough to remain a validated allow-list rather than freeform input.
export const SUPPORTED_TIMEZONES = [
  "UTC",
  // Americas
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
  // Europe / Africa
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
  // Asia / Pacific
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

// Defensive boot check: guard against a typo in the list above ever shipping as a "valid" zone.
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
