
import type { AuthContext } from "../auth/authenticate";
import { env } from "../config/env";
import { forTeam } from "../data-access";
import { NotificationType, Role } from "../generated/prisma/client";
import { isSupportedTimezone } from "../shared/ianaZones";
import { currentLocalDate } from "../standups/localDate";
import { listRoster } from "../teams/teams.service";
import { DateTime } from "luxon";
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
 */
export async function runReminderTick(teamId: string): Promise<void> {
  const roster = await listRoster(systemAuth(teamId));
  const db = forTeam(teamId);

  for (const member of roster) {
    if (member.timezone === null || !isSupportedTimezone(member.timezone)) {
      continue;
    }

    const nowLocal = DateTime.now().setZone(member.timezone);
    if (nowLocal.hour < env.REMINDER_LOCAL_HOUR) {
      continue;
    }

    const localDate = currentLocalDate(member.timezone);
    const posted = await db.standup.findFirst({
      where: { userId: member.id, localStandupDate: localDate },
      select: { id: true },
    });
    if (posted) {
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
