// Phase 6 — Teams & Membership invariants against a live database. These exercise tenant isolation,
// the last-owner-admin guard, and soft-removal-preserves-history through the real service functions and
// the `forTeam` scoping wrapper.
//
// Requires DATABASE_URL to point at a NEON BRANCH, never production (plan Phase 6). The suite is skipped
// when it is unset, and all DB imports are deferred so the pure suites run without any database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { AuthContext } from "../auth/authenticate";

const runDb = Boolean(process.env.DATABASE_URL);

describe("teams membership (integration; requires a Neon-branch DATABASE_URL)", { skip: !runDb }, () => {
  let prisma: typeof import("../db/prisma")["prisma"];
  let teams: typeof import("./teams.service");
  let Role: typeof import("../generated/prisma/client")["Role"];

  const createdTeamIds: string[] = [];

  async function seedTeam(): Promise<string> {
    const team = await prisma.team.create({ data: { name: `test-${randomUUID()}` } });
    createdTeamIds.push(team.id);
    return team.id;
  }

  async function seedUser(
    teamId: string,
    role: (typeof Role)[keyof typeof Role],
    opts: { isActive?: boolean; pending?: boolean } = {},
  ): Promise<string> {
    const user = await prisma.user.create({
      data: {
        teamId,
        name: "Test User",
        email: `u-${randomUUID()}@example.test`,
        role,
        passwordHash: opts.pending ? null : "hash",
        isActive: opts.isActive ?? true,
        timezone: "Asia/Karachi",
      },
    });
    return user.id;
  }

  const auth = (userId: string, teamId: string): AuthContext => ({
    userId,
    teamId,
    role: Role.OWNER_ADMIN,
  });

  before(async () => {
    ({ prisma } = await import("../db/prisma"));
    teams = await import("./teams.service");
    ({ Role } = await import("../generated/prisma/client"));
  });

  after(async () => {
    // Clean up in dependency order — Standup.user is onDelete: Restrict, so standups go before users.
    await prisma.standup.deleteMany({ where: { teamId: { in: createdTeamIds } } });
    await prisma.onboardingToken.deleteMany({ where: { teamId: { in: createdTeamIds } } });
    await prisma.sessionRefreshToken.deleteMany({ where: { teamId: { in: createdTeamIds } } });
    await prisma.user.deleteMany({ where: { teamId: { in: createdTeamIds } } });
    await prisma.team.deleteMany({ where: { id: { in: createdTeamIds } } });
    await prisma.$disconnect();
  });

  it("lists only the caller's own team roster", async () => {
    const teamA = await seedTeam();
    const teamB = await seedTeam();
    const ownerA = await seedUser(teamA, Role.OWNER_ADMIN);
    const ownerB = await seedUser(teamB, Role.OWNER_ADMIN);

    const roster = await teams.listRoster(auth(ownerA, teamA));
    const ids = roster.map((m) => m.id);
    assert.ok(ids.includes(ownerA));
    assert.ok(!ids.includes(ownerB));
  });

  it("adds a PENDING member reported with pending status", async () => {
    const teamA = await seedTeam();
    const ownerA = await seedUser(teamA, Role.OWNER_ADMIN);

    const member = await teams.addMember(auth(ownerA, teamA), {
      name: "Newcomer",
      email: `new-${randomUUID()}@example.test`,
    });
    assert.equal(member.role, Role.MEMBER);
    assert.equal(member.status, "pending");

    const row = await prisma.user.findUnique({ where: { id: member.id } });
    assert.equal(row?.teamId, teamA);
    assert.equal(row?.passwordHash, null);
  });

  it("cannot change the role of another team's member (scoped not-found)", async () => {
    const teamA = await seedTeam();
    const teamB = await seedTeam();
    const ownerA = await seedUser(teamA, Role.OWNER_ADMIN);
    const memberB = await seedUser(teamB, Role.MEMBER);

    await assert.rejects(
      () => teams.setRole(auth(ownerA, teamA), memberB, Role.LEAD),
      /Member not found/,
    );
    // The cross-team member is untouched.
    const row = await prisma.user.findUnique({ where: { id: memberB } });
    assert.equal(row?.role, Role.MEMBER);
  });

  it("promotes a member to lead and back", async () => {
    const teamA = await seedTeam();
    const ownerA = await seedUser(teamA, Role.OWNER_ADMIN);
    const member = await seedUser(teamA, Role.MEMBER);

    const promoted = await teams.setRole(auth(ownerA, teamA), member, Role.LEAD);
    assert.equal(promoted.role, Role.LEAD);
    const demoted = await teams.setRole(auth(ownerA, teamA), member, Role.MEMBER);
    assert.equal(demoted.role, Role.MEMBER);
  });

  it("refuses to demote or remove the last owner-admin", async () => {
    const teamA = await seedTeam();
    const owner = await seedUser(teamA, Role.OWNER_ADMIN);

    await assert.rejects(
      () => teams.setRole(auth(owner, teamA), owner, Role.MEMBER),
      /at least one owner-admin/,
    );
    await assert.rejects(
      () => teams.removeMember(auth(owner, teamA), owner),
      /at least one owner-admin/,
    );
  });

  it("soft-deactivates a removed member while their standups survive", async () => {
    const teamA = await seedTeam();
    const owner1 = await seedUser(teamA, Role.OWNER_ADMIN);
    const owner2 = await seedUser(teamA, Role.OWNER_ADMIN);
    const member = await seedUser(teamA, Role.MEMBER);
    const standup = await prisma.standup.create({
      data: {
        teamId: teamA,
        userId: member,
        yesterday: "y",
        today: "t",
        blockers: "",
        submittedAtUtc: new Date("2026-07-01T09:00:00Z"),
        timezone: "Asia/Karachi",
        localStandupDate: new Date("2026-07-01T00:00:00Z"),
      },
    });

    await teams.removeMember(auth(owner1, teamA), member);
    const removed = await prisma.user.findUnique({ where: { id: member } });
    assert.equal(removed?.isActive, false);
    const surviving = await prisma.standup.findUnique({ where: { id: standup.id } });
    assert.ok(surviving);

    // A second owner remains, so removing owner2 is still permitted.
    await teams.removeMember(auth(owner1, teamA), owner2);
    const removedOwner = await prisma.user.findUnique({ where: { id: owner2 } });
    assert.equal(removedOwner?.isActive, false);
  });
});
