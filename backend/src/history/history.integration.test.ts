// History module against a live database (implementation plan Phase 2): cursor pagination of the caller's
// own timeline over the `[userId, submittedAtUtc desc]` index, self-scoping to the caller, and the team
// past-day view delegating to the dashboard read model.
//
// Requires DATABASE_URL to point at a NEON BRANCH, never production. Skipped when unset; DB imports are
// deferred so the pure suites run without any database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { AuthContext } from "../auth/authenticate";
import type { Role } from "../generated/prisma/client";

const runDb = Boolean(process.env.DATABASE_URL);

// Matches the service's internal PAGE_SIZE — the timeline is paginated by design (architecture §15).
const PAGE_SIZE = 20;

describe("history (integration; requires a Neon-branch DATABASE_URL)", { skip: !runDb }, () => {
  let prisma: (typeof import("../db/prisma"))["prisma"];
  let history: typeof import("./history.service");
  let RoleEnum: (typeof import("../generated/prisma/client"))["Role"];

  const createdTeamIds: string[] = [];

  async function seedTeam(): Promise<string> {
    const team = await prisma.team.create({ data: { name: `test-${randomUUID()}` } });
    createdTeamIds.push(team.id);
    return team.id;
  }

  async function seedUser(teamId: string, name = "Test User"): Promise<string> {
    const user = await prisma.user.create({
      data: {
        teamId,
        name,
        email: `u-${randomUUID()}@example.test`,
        role: RoleEnum.MEMBER,
        passwordHash: "hash",
        isActive: true,
        timezone: "Asia/Karachi",
      },
    });
    return user.id;
  }

  // Insert `count` standups for a user on consecutive days — distinct localStandupDates satisfy the
  // one-per-day unique constraint; ascending submittedAtUtc gives a deterministic newest-first order.
  async function seedTimeline(teamId: string, userId: string, count: number): Promise<void> {
    const rows = Array.from({ length: count }, (_, i) => {
      const day = new Date(Date.UTC(2026, 1, 1 + i));
      return {
        teamId,
        userId,
        yesterday: `y${i}`,
        today: `t${i}`,
        blockers: "",
        submittedAtUtc: new Date(Date.UTC(2026, 1, 1 + i, 9)),
        timezone: "Asia/Karachi",
        localStandupDate: day,
      };
    });
    await prisma.standup.createMany({ data: rows });
  }

  const auth = (userId: string, teamId: string, role: Role): AuthContext => ({ userId, teamId, role });

  before(async () => {
    ({ prisma } = await import("../db/prisma"));
    history = await import("./history.service");
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

  it("cursor-paginates the caller's timeline newest-first with no overlap", async () => {
    const teamId = await seedTeam();
    const userId = await seedUser(teamId);
    await seedTimeline(teamId, userId, PAGE_SIZE + 1);

    const page1 = await history.getMyHistory(auth(userId, teamId, RoleEnum.MEMBER));
    assert.equal(page1.items.length, PAGE_SIZE);
    assert.ok(page1.nextCursor);

    // Strictly descending by submittedAtUtc — the indexed order, not a scan-and-filter.
    for (let i = 1; i < page1.items.length; i++) {
      assert.ok(
        page1.items[i - 1]!.submittedAtUtc.getTime() > page1.items[i]!.submittedAtUtc.getTime(),
      );
    }

    const page2 = await history.getMyHistory(auth(userId, teamId, RoleEnum.MEMBER), page1.nextCursor!);
    assert.equal(page2.items.length, 1);
    assert.equal(page2.nextCursor, null);

    const ids = new Set([...page1.items, ...page2.items].map((s) => s.id));
    assert.equal(ids.size, PAGE_SIZE + 1);
  });

  it("returns only the caller's own updates", async () => {
    const teamId = await seedTeam();
    const alpha = await seedUser(teamId, "Alpha");
    const beta = await seedUser(teamId, "Beta");
    await seedTimeline(teamId, beta, 2);

    const page = await history.getMyHistory(auth(alpha, teamId, RoleEnum.MEMBER));
    assert.equal(page.items.length, 0);
    assert.equal(page.nextCursor, null);
  });

  it("serves the team past-day view via the dashboard read model", async () => {
    const teamId = await seedTeam();
    const owner = await seedUser(teamId, "Owner");
    const member = await seedUser(teamId, "Member");

    const day = new Date("2026-04-20T00:00:00Z");
    await prisma.standup.create({
      data: {
        teamId,
        userId: member,
        yesterday: "y",
        today: "t",
        blockers: "",
        submittedAtUtc: new Date("2026-04-20T09:00:00Z"),
        timezone: "Asia/Karachi",
        localStandupDate: day,
      },
    });

    const board = await history.getTeamHistoryForDate(auth(owner, teamId, RoleEnum.OWNER_ADMIN), day);
    assert.equal(board.view, "date");
    assert.equal(board.date.getTime(), day.getTime());
    const memberCard = board.cards.find((c) => c.userId === member);
    assert.ok(memberCard);
    assert.equal(memberCard.hasUpdate, true);
  });
});
