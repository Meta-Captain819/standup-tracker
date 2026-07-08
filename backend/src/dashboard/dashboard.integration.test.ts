// Dashboard read model against a live database (implementation plan Phase 1): tenant-scoped latest-per-
// person, "no update yet" markers against each writer's own local day, pending members, and the date-
// picker board aligned per person. Exercised through the real service and the `forTeam` wrapper.
//
// Requires DATABASE_URL to point at a NEON BRANCH, never production. Skipped when unset; DB imports are
// deferred so the pure suites run without any database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { AuthContext } from "../auth/authenticate";
import type { Role } from "../generated/prisma/client";

const runDb = Boolean(process.env.DATABASE_URL);

describe("dashboard read model (integration; requires a Neon-branch DATABASE_URL)", { skip: !runDb }, () => {
  let prisma: (typeof import("../db/prisma"))["prisma"];
  let dashboard: typeof import("./dashboard.service");
  let standups: typeof import("../standups/standups.service");
  let RoleEnum: (typeof import("../generated/prisma/client"))["Role"];

  const createdTeamIds: string[] = [];

  async function seedTeam(): Promise<string> {
    const team = await prisma.team.create({ data: { name: `test-${randomUUID()}` } });
    createdTeamIds.push(team.id);
    return team.id;
  }

  async function seedUser(
    teamId: string,
    name: string,
    opts: { role?: Role; pending?: boolean; timezone?: string | null } = {},
  ): Promise<string> {
    const user = await prisma.user.create({
      data: {
        teamId,
        name,
        email: `u-${randomUUID()}@example.test`,
        role: opts.role ?? RoleEnum.MEMBER,
        passwordHash: opts.pending ? null : "hash",
        isActive: true,
        timezone: opts.timezone === undefined ? "Asia/Karachi" : opts.timezone,
      },
    });
    return user.id;
  }

  const auth = (userId: string, teamId: string, role: Role): AuthContext => ({ userId, teamId, role });

  function card<T extends { userId: string }>(cards: T[], userId: string): T {
    const found = cards.find((c) => c.userId === userId);
    assert.ok(found, `expected a card for ${userId}`);
    return found;
  }

  before(async () => {
    ({ prisma } = await import("../db/prisma"));
    dashboard = await import("./dashboard.service");
    standups = await import("../standups/standups.service");
    ({ Role: RoleEnum } = await import("../generated/prisma/client"));
  });

  after(async () => {
    await prisma.standup.deleteMany({ where: { teamId: { in: createdTeamIds } } });
    await prisma.onboardingToken.deleteMany({ where: { teamId: { in: createdTeamIds } } });
    await prisma.sessionRefreshToken.deleteMany({ where: { teamId: { in: createdTeamIds } } });
    await prisma.user.deleteMany({ where: { teamId: { in: createdTeamIds } } });
    await prisma.team.deleteMany({ where: { id: { in: createdTeamIds } } });
    await prisma.$disconnect();
  });

  it("builds the live board: latest-per-person, no-update, and pending markers", async () => {
    const teamId = await seedTeam();
    const owner = await seedUser(teamId, "Owner", { role: RoleEnum.OWNER_ADMIN });
    const posted = await seedUser(teamId, "Posted");
    const silent = await seedUser(teamId, "Silent");
    const pending = await seedUser(teamId, "Pending", { pending: true, timezone: null });

    // The posted member has an older update plus today's — the live board must surface today's as latest.
    await prisma.standup.create({
      data: {
        teamId,
        userId: posted,
        yesterday: "old",
        today: "old",
        blockers: "",
        submittedAtUtc: new Date("2026-01-01T09:00:00Z"),
        timezone: "Asia/Karachi",
        localStandupDate: new Date("2026-01-01T00:00:00Z"),
      },
    });
    const today = await standups.submitStandup(auth(posted, teamId, RoleEnum.MEMBER), {
      yesterday: "shipped",
      today: "review",
      blockers: "",
      timezone: "Asia/Karachi",
    });

    const board = await dashboard.getLiveBoard(auth(owner, teamId, RoleEnum.OWNER_ADMIN));
    assert.equal(board.view, "live");

    const postedCard = card(board.cards, posted);
    assert.equal(postedCard.latest?.id, today.id);
    assert.equal(postedCard.hasPostedToday, true);

    const silentCard = card(board.cards, silent);
    assert.equal(silentCard.latest, null);
    assert.equal(silentCard.hasPostedToday, false);
    assert.equal(silentCard.status, "active");

    const pendingCard = card(board.cards, pending);
    assert.equal(pendingCard.status, "pending");
    assert.equal(pendingCard.currentLocalDate, null);
    assert.equal(pendingCard.hasPostedToday, false);
  });

  it("scopes the live board to the caller's own team", async () => {
    const teamA = await seedTeam();
    const owner = await seedUser(teamA, "OwnerA", { role: RoleEnum.OWNER_ADMIN });

    const teamB = await seedTeam();
    const outsider = await seedUser(teamB, "Outsider");
    await standups.submitStandup(auth(outsider, teamB, RoleEnum.MEMBER), {
      yesterday: "x",
      today: "y",
      blockers: "",
      timezone: "Asia/Karachi",
    });

    const board = await dashboard.getLiveBoard(auth(owner, teamA, RoleEnum.OWNER_ADMIN));
    assert.equal(board.cards.some((c) => c.userId === outsider), false);
  });

  it("builds the date-picker board aligned to each person's version of a past day", async () => {
    const teamId = await seedTeam();
    const owner = await seedUser(teamId, "Owner", { role: RoleEnum.OWNER_ADMIN });
    const posted = await seedUser(teamId, "Posted");
    const silent = await seedUser(teamId, "Silent");

    const day = new Date("2026-03-16T00:00:00Z");
    await prisma.standup.create({
      data: {
        teamId,
        userId: posted,
        yesterday: "planned",
        today: "built the picker",
        blockers: "waiting on review",
        submittedAtUtc: new Date("2026-03-16T08:30:00Z"),
        timezone: "Europe/Berlin",
        localStandupDate: day,
      },
    });

    const board = await dashboard.getDateBoard(auth(owner, teamId, RoleEnum.OWNER_ADMIN), day);
    assert.equal(board.view, "date");
    assert.equal(board.date.getTime(), day.getTime());

    const postedCard = card(board.cards, posted);
    assert.equal(postedCard.hasUpdate, true);
    assert.equal(postedCard.standup?.localStandupDate.getTime(), day.getTime());
    assert.equal(postedCard.standup?.timezone, "Europe/Berlin");
    assert.equal(postedCard.standup?.hasBlocker, true);

    const silentCard = card(board.cards, silent);
    assert.equal(silentCard.hasUpdate, false);
    assert.equal(silentCard.standup, null);
  });
});
