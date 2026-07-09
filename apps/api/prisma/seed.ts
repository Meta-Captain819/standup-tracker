/**
 * Development seed — a demo team with dummy members and a week of standups so anyone can log in and
 * see the app in use. Safe to re-run: it wipes all data first, then recreates the demo tenant.
 *
 * Run with `npm --prefix apps/api run seed` (or `db:reset` to also re-apply migrations first).
 * All demo accounts share the password below — see the README's "Try it" section.
 */

import "dotenv/config";
import { DateTime } from "luxon";
import { hashPassword } from "../src/auth/passwords";
import { prisma } from "../src/db/prisma";
import { Role } from "../src/generated/prisma/client";
import { deriveLocalStandupDate } from "../src/standups/localDate";
import type { SupportedTimezone } from "../src/shared/ianaZones";

const DEMO_PASSWORD = "standup123";
const DAYS_OF_HISTORY = 5;

interface SeedMember {
  name: string;
  email: string;
  role: Role;
  timezone: SupportedTimezone;
  /** A pending (invited-but-not-accepted) member has no password and posts no standups. */
  pending?: boolean;
}

const TEAM_NAME = "Orbit Labs";

const MEMBERS: SeedMember[] = [
  { name: "Ava Thompson", email: "ava@orbitlabs.dev", role: Role.OWNER_ADMIN, timezone: "America/New_York" },
  { name: "Liam Chen", email: "liam@orbitlabs.dev", role: Role.LEAD, timezone: "America/Los_Angeles" },
  { name: "Sofia Garcia", email: "sofia@orbitlabs.dev", role: Role.MEMBER, timezone: "Europe/Madrid" },
  { name: "Noah Patel", email: "noah@orbitlabs.dev", role: Role.MEMBER, timezone: "Asia/Kolkata" },
  { name: "Emma Novak", email: "emma@orbitlabs.dev", role: Role.MEMBER, timezone: "Europe/Berlin" },
  { name: "Yuki Tanaka", email: "yuki@orbitlabs.dev", role: Role.MEMBER, timezone: "Asia/Tokyo" },
  // Invited but has not accepted yet — demonstrates the "pending" roster state.
  { name: "Oliver Brooks", email: "oliver@orbitlabs.dev", role: Role.MEMBER, timezone: "Europe/London", pending: true },
];

/** A pool of realistic updates per member email; day 0 is today, index N is N days ago. */
const STANDUP_SCRIPTS: Record<string, Array<{ yesterday: string; today: string; blockers: string }>> = {
  "ava@orbitlabs.dev": [
    { yesterday: "Reviewed the Q3 roadmap draft and left comments for the leads.", today: "Finalize the roadmap and share it with the whole team.", blockers: "" },
    { yesterday: "Ran the quarterly planning sync and captured action items.", today: "Draft the Q3 roadmap and circulate for feedback.", blockers: "" },
    { yesterday: "Interviewed two backend candidates.", today: "Debrief with the panel and make a hiring call.", blockers: "Waiting on the second interviewer's written feedback." },
    { yesterday: "Cleared the support escalation backlog.", today: "Prep the quarterly planning sync agenda.", blockers: "" },
    { yesterday: "Onboarded the new design contractor.", today: "Catch up on the support escalation backlog.", blockers: "" },
  ],
  "liam@orbitlabs.dev": [
    { yesterday: "Merged the auth refactor and cut a release candidate.", today: "Monitor the RC in staging and start on rate-limit tuning.", blockers: "" },
    { yesterday: "Paired with Noah on the session rotation bug.", today: "Finish and merge the auth refactor.", blockers: "" },
    { yesterday: "Wrote the incident retro for last week's outage.", today: "Pair with Noah on the session rotation bug.", blockers: "Staging DB keeps hitting connection limits." },
    { yesterday: "Triaged the sprint board and assigned tickets.", today: "Write the incident retro.", blockers: "" },
    { yesterday: "Reviewed six PRs and unblocked the frontend team.", today: "Triage the sprint board for the new sprint.", blockers: "" },
  ],
  "sofia@orbitlabs.dev": [
    { yesterday: "Shipped the new dashboard empty states.", today: "Start on the history page pagination.", blockers: "" },
    { yesterday: "Fixed the dark-mode contrast issues QA flagged.", today: "Build the dashboard empty states.", blockers: "" },
    { yesterday: "Built the timezone picker component.", today: "Address the dark-mode contrast issues from QA.", blockers: "" },
    { yesterday: "Wired up the standup edit flow.", today: "Build the timezone picker component.", blockers: "Design still hasn't finalized the picker spec." },
    { yesterday: "Set up the component library Storybook.", today: "Wire up the standup edit flow.", blockers: "" },
  ],
  "noah@orbitlabs.dev": [
    { yesterday: "Optimized the team-board query — 400ms down to 40ms.", today: "Add the blocker-alert dedupe index.", blockers: "" },
    { yesterday: "Paired with Liam on session rotation.", today: "Profile and optimize the team-board query.", blockers: "" },
    { yesterday: "Wrote migration for the notifications table.", today: "Pair with Liam on session rotation.", blockers: "" },
    { yesterday: "Investigated the pooled-connection timeouts.", today: "Write the notifications table migration.", blockers: "Can't reproduce the timeout locally — need prod logs access." },
    { yesterday: "Added structured logging to the API.", today: "Investigate the pooled-connection timeouts.", blockers: "" },
  ],
  "emma@orbitlabs.dev": [
    { yesterday: "Drafted the reminder email templates.", today: "Hook the templates into the notification queue.", blockers: "" },
    { yesterday: "Wrote tests for the scheduler local-day logic.", today: "Draft the reminder email templates.", blockers: "" },
    { yesterday: "Reviewed the AI summary prompt with Ava.", today: "Write tests for the scheduler local-day logic.", blockers: "" },
    { yesterday: "Tuned the Gemini summary prompt.", today: "Review the AI summary prompt with Ava.", blockers: "" },
    { yesterday: "Set up the insights caching layer.", today: "Tune the Gemini summary prompt.", blockers: "Gemini API key for staging still not provisioned." },
  ],
  "yuki@orbitlabs.dev": [
    { yesterday: "Finished the SSE reconnect handling on the board.", today: "Load-test the realtime hub with 200 clients.", blockers: "" },
    { yesterday: "Fixed the live-board flicker on update.", today: "Finish SSE reconnect handling.", blockers: "" },
    { yesterday: "Built the presence indicators.", today: "Fix the live-board flicker on update.", blockers: "" },
    { yesterday: "Prototyped the realtime hub.", today: "Build the presence indicators.", blockers: "" },
    { yesterday: "Researched SSE vs WebSocket trade-offs.", today: "Prototype the realtime hub.", blockers: "" },
  ],
};

async function wipe(): Promise<void> {
  // Children first so foreign keys never block the delete.
  await prisma.notification.deleteMany();
  await prisma.aiSummary.deleteMany();
  await prisma.standup.deleteMany();
  await prisma.onboardingToken.deleteMany();
  await prisma.sessionRefreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();
}

async function main(): Promise<void> {
  console.log("Wiping existing data…");
  await wipe();

  console.log(`Creating team "${TEAM_NAME}"…`);
  const team = await prisma.team.create({ data: { name: TEAM_NAME } });

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  for (const member of MEMBERS) {
    const user = await prisma.user.create({
      data: {
        teamId: team.id,
        name: member.name,
        email: member.email,
        role: member.role,
        // Pending members haven't accepted their invite, so they have no password yet.
        passwordHash: member.pending ? null : passwordHash,
        timezone: member.pending ? null : member.timezone,
        isActive: true,
      },
    });

    if (member.pending) {
      console.log(`  • ${member.name} (${member.role}) — pending invite`);
      continue;
    }

    const scripts = STANDUP_SCRIPTS[member.email] ?? [];
    let posted = 0;
    for (let dayOffset = 0; dayOffset < DAYS_OF_HISTORY; dayOffset += 1) {
      const script = scripts[dayOffset];
      if (!script) continue;

      // A plausible local-morning submission time, `dayOffset` days ago in the writer's zone.
      const submittedAtUtc = DateTime.now()
        .setZone(member.timezone)
        .minus({ days: dayOffset })
        .set({ hour: 9, minute: 25 + dayOffset, second: 0, millisecond: 0 })
        .toJSDate();

      await prisma.standup.create({
        data: {
          userId: user.id,
          teamId: team.id,
          yesterday: script.yesterday,
          today: script.today,
          blockers: script.blockers,
          submittedAtUtc,
          timezone: member.timezone,
          localStandupDate: deriveLocalStandupDate(submittedAtUtc, member.timezone),
        },
      });
      posted += 1;
    }
    console.log(`  • ${member.name} (${member.role}) — ${posted} standups`);
  }

  console.log("\nSeed complete.");
  console.log(`Team: ${TEAM_NAME}`);
  console.log(`Password for every account: ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
