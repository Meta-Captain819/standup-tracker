
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { runBlockerAlertsTick } from "./notifications.alerts";
import { runReminderTick } from "./notifications.reminders";

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
