
import type { AuthContext } from "../auth/authenticate";
import { env } from "../config/env";
import { forTeam } from "../data-access";
import { NotificationType, Role } from "../generated/prisma/client";
import { isSupportedTimezone } from "../shared/ianaZones";
import { currentLocalDate } from "../standups/localDate";
import { listRoster } from "../teams/teams.service";
import { DateTime } from "luxon";
import { distinctLocalDates, standupKey } from "./notifications.localDay";
import { buildReminderMessage } from "./notifications.messages";
import { notify } from "./notifications.service";

function systemAuth(teamId: string): AuthContext {
  return { teamId, userId: "system", role: Role.OWNER_ADMIN };
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Evaluate and dispatch due reminders for one team's active roster. A member is due once their local
 * clock has reached `REMINDER_LOCAL_HOUR` for their current local day and they have no standup for that
 * day yet. `dedupeKey = reminder:${userId}:${localDate}` guards one reminder per member per local day —
 * submitting flips the "no standup for today" condition false, so a submitted member is never nudged and
 * clearing is implicit (architecture §12). Members with a null/unresolvable timezone are skipped.
 *
 * The "already posted today?" check is a single indexed read over the team's `[teamId, localStandupDate]`
 * index for all candidates at once, not a per-member round trip.
 */
export async function runReminderTick(teamId: string): Promise<void> {
  const roster = await listRoster(systemAuth(teamId));
  const db = forTeam(teamId);

  const candidates = roster.flatMap((member) => {
    if (member.timezone === null || !isSupportedTimezone(member.timezone)) {
      return [];
    }
    if (DateTime.now().setZone(member.timezone).hour < env.REMINDER_LOCAL_HOUR) {
      return [];
    }
    return [{ member, localDate: currentLocalDate(member.timezone) }];
  });
  if (candidates.length === 0) {
    return;
  }

  const postedRows = await db.standup.findMany({
    where: { localStandupDate: { in: distinctLocalDates(candidates.map((c) => c.localDate)) } },
    select: { userId: true, localStandupDate: true },
  });
  const postedKeys = new Set(postedRows.map((row) => standupKey(row.userId, row.localStandupDate)));

  for (const { member, localDate } of candidates) {
    if (postedKeys.has(standupKey(member.id, localDate))) {
      continue;
    }
    await notify(teamId, {
      userId: member.id,
      type: NotificationType.REMINDER,
      dedupeKey: `reminder:${member.id}:${dateKey(localDate)}`,
      content: buildReminderMessage(localDate),
      email: member.email,
    });
  }
}
