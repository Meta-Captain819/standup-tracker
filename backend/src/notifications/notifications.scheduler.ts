// Singleton scheduler (implementation plan Phase 5/6; architecture §4/§12/§13, CLAUDE §9). A short-
// interval loop that dispatches member reminders (Phase 5) and lead blocker alerts (Phase 6) — the same
// singleton, the same per-team sweep, no second scheduler. Started once at boot (index.ts); never runs
// inside a request handler.
//
// Singleton guarantee: each tick, the loop attempts a Postgres advisory lock
// (`pg_try_advisory_lock`) — a system-level raw call, not team data (the data-access "no raw for team
// data" caveat does not apply here, per the implementation plan). Only the instance holding the lock
// dispatches for that tick; it releases the lock when the tick completes, so horizontally scaling the web
// tier never multiplies reminders/alerts.
//
// Documented caveat: `DATABASE_URL` is Neon's pooled endpoint, so this session-scoped lock's acquire and
// release calls are not guaranteed to land on the same physical backend connection under aggressive
// connection reuse. The advisory lock exists to avoid every instance redundantly re-scanning every team on
// every tick — it is an efficiency guard, not the correctness guarantee. The actual guarantee against a
// duplicated reminder or alert is the Phase 4 `dedupeKey` unique constraint (CLAUDE §9): even a rare
// double-run across instances can never create a second inbox row, live push, or email for the same
// (team, dedupeKey). A dedicated session-pinned connection (e.g. Neon's direct endpoint) would make the
// lock itself airtight, but CLAUDE §4/§12 reserves the direct endpoint for migrations only — not
// worked around here.
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { runBlockerAlertsTick } from "./notifications.alerts";
import { runReminderTick } from "./notifications.reminders";

// A fixed, arbitrary 32-bit key namespacing this lock. Its value carries no meaning beyond identifying
// "the standup-tracker reminder/alert scheduler" among any other advisory locks on the same database.
const ADVISORY_LOCK_KEY = 727_002_026;

async function tryAcquireLock(): Promise<boolean> {
  const rows = await prisma.$queryRaw<
    { locked: boolean }[]
  >`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS locked`;
  return rows[0]?.locked ?? false;
}

async function releaseLock(): Promise<void> {
  await prisma.$queryRaw`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`;
}

async function runTick(): Promise<void> {
  let acquired = false;
  try {
    acquired = await tryAcquireLock();
    if (!acquired) {
      return;
    }

    // Team enumeration is a sanctioned system/bootstrap read on the base client (like signup's team
    // creation) — the only non-`forTeam` team touch. Every subsequent read/write for that team goes
    // through `forTeam(team.id)` inside the reminder/alert evaluators (Golden Rule 2 holds off-request).
    const teams = await prisma.team.findMany({ select: { id: true } });
    for (const team of teams) {
      await runReminderTick(team.id);
      await runBlockerAlertsTick(team.id);
    }
  } catch (err) {
    console.error("[scheduler] tick failed", err);
  } finally {
    if (acquired) {
      await releaseLock().catch((err: unknown) => {
        console.error("[scheduler] failed to release advisory lock", err);
      });
    }
  }
}

let timer: ReturnType<typeof setInterval> | undefined;

/** Start the singleton scheduler loop. Call once at boot; idempotent if called again. */
export function startScheduler(): void {
  if (timer) {
    return;
  }
  timer = setInterval(() => void runTick(), env.SCHEDULER_INTERVAL_MS);
  timer.unref();
}

/** Stop the scheduler loop (graceful shutdown). */
export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
}
