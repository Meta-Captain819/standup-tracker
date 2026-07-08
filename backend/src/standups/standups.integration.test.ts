// Phase 6 — Standups invariants against a live database: idempotent one-per-day upsert, the edit
// window, and self-scoped reads through the real service functions and the `forTeam` wrapper.
//
// Requires DATABASE_URL to point at a NEON BRANCH, never production (plan Phase 6). Skipped when unset;
// DB imports are deferred so the pure suites run without any database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { AuthContext } from "../auth/authenticate";

const runDb = Boolean(process.env.DATABASE_URL);

describe("standups (integration; requires a Neon-branch DATABASE_URL)", { skip: !runDb }, () => {
  let prisma: typeof import("../db/prisma")["prisma"];
  let standups: typeof import("./standups.service");
  let Role: typeof import("../generated/prisma/client")["Role"];

  const createdTeamIds: string[] = [];

  async function seedTeamAndUser(): Promise<AuthContext> {
    const team = await prisma.team.create({ data: { name: `test-${randomUUID()}` } });
    createdTeamIds.push(team.id);
    const user = await prisma.user.create({
      data: {
        teamId: team.id,
        name: "Test User",
        email: `u-${randomUUID()}@example.test`,
        role: Role.MEMBER,
        passwordHash: "hash",
        isActive: true,
        timezone: "Asia/Karachi",
      },
    });
    return { userId: user.id, teamId: team.id, role: Role.MEMBER };
  }

  const kbl = (over: Partial<Record<"yesterday" | "today" | "blockers", string>> = {}) => ({
    yesterday: "shipped",
    today: "review",
    blockers: "",
    timezone: "Asia/Karachi" as const,
    ...over,
  });

  before(async () => {
    ({ prisma } = await import("../db/prisma"));
    standups = await import("./standups.service");
    ({ Role } = await import("../generated/prisma/client"));
  });

  after(async () => {
    await prisma.standup.deleteMany({ where: { teamId: { in: createdTeamIds } } });
    await prisma.onboardingToken.deleteMany({ where: { teamId: { in: createdTeamIds } } });
    await prisma.sessionRefreshToken.deleteMany({ where: { teamId: { in: createdTeamIds } } });
    await prisma.user.deleteMany({ where: { teamId: { in: createdTeamIds } } });
    await prisma.team.deleteMany({ where: { id: { in: createdTeamIds } } });
    await prisma.$disconnect();
  });

  it("upserts one row per local day on repeated submits (idempotent, CLAUDE §8)", async () => {
    const auth = await seedTeamAndUser();
    const first = await standups.submitStandup(auth, kbl());
    const second = await standups.submitStandup(auth, kbl({ today: "review + merge" }));

    assert.equal(first.id, second.id);
    assert.equal(second.today, "review + merge");
    const count = await prisma.standup.count({ where: { userId: auth.userId } });
    assert.equal(count, 1);
  });

  it("edits today's update and stamps the edited marker", async () => {
    const auth = await seedTeamAndUser();
    const submitted = await standups.submitStandup(auth, kbl());
    assert.equal(submitted.editedAt, null);

    const edited = await standups.editStandup(auth, submitted.id, kbl({ today: "review done" }));
    assert.equal(edited.today, "review done");
    assert.ok(edited.editedAt instanceof Date);
  });

  it("rejects edits after the writer's local day has rolled over", async () => {
    const auth = await seedTeamAndUser();
    const past = await prisma.standup.create({
      data: {
        teamId: auth.teamId,
        userId: auth.userId,
        yesterday: "y",
        today: "t",
        blockers: "",
        submittedAtUtc: new Date("2026-01-01T09:00:00Z"),
        timezone: "Asia/Karachi",
        localStandupDate: new Date("2026-01-01T00:00:00Z"),
      },
    });

    await assert.rejects(
      () => standups.editStandup(auth, past.id, kbl({ today: "too late" })),
      /can no longer be edited/,
    );
  });

  it("cannot edit another member's update (self-scoped not-found)", async () => {
    const alpha = await seedTeamAndUser();
    const beta = await seedTeamAndUser();
    const betaUpdate = await standups.submitStandup(beta, kbl());

    await assert.rejects(
      () => standups.editStandup(alpha, betaUpdate.id, kbl({ today: "intrusion" })),
      /Update not found/,
    );
  });

  it("returns only the caller's own recent updates", async () => {
    const alpha = await seedTeamAndUser();
    const beta = await seedTeamAndUser();
    await standups.submitStandup(beta, kbl());

    const recent = await standups.getMyRecent(alpha);
    assert.equal(recent.length, 0);
  });

  it("resolves the caller's current-day update via their zone", async () => {
    const auth = await seedTeamAndUser();
    const submitted = await standups.submitStandup(auth, kbl());
    const today = await standups.getMyToday(auth, "Asia/Karachi");
    assert.equal(today?.id, submitted.id);
  });
});
