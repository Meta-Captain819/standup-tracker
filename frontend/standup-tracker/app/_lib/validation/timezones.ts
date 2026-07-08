// Literal mirror of backend/src/shared/ianaZones.ts — no shared workspace package exists between
// backend and frontend/standup-tracker (different package managers, frontend has its own git root;
// see standup-tracker-frontend-plan.md's flagged gap), so this list must be kept in sync by hand.
import { z } from "zod";

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

export function isSupportedTimezone(value: string): value is SupportedTimezone {
  return supported.has(value);
}

export const timezoneSchema = z
  .string()
  .refine(isSupportedTimezone, { message: "Unsupported or invalid timezone." });
