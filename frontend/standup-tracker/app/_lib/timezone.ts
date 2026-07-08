"use client";

import { useState } from "react";
import { isSupportedTimezone, type SupportedTimezone } from "@/app/_lib/validation/timezones";

/**
 * Captured automatically from the browser — never configured, never a picker (CLAUDE.md §6). Falls
 * back to UTC if the resolved zone isn't in the backend's allow-list (backend/src/shared/ianaZones.ts);
 * the backend hard-rejects anything outside that list, so an unsupported browser zone must degrade
 * gracefully here rather than break signup/login/submit.
 */
export function captureTimezone(): SupportedTimezone {
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isSupportedTimezone(resolved) ? resolved : "UTC";
}

export function useCapturedTimezone(): SupportedTimezone {
  const [timezone] = useState(captureTimezone);
  return timezone;
}
