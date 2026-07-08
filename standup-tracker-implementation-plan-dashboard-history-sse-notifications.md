# Implementation Plan — Dashboard, History, SSE & Notifications/Scheduling

**Scope:** the four backend modules named in the architecture doc's §2 module list that are not yet built:
**Dashboard / Read Models**, **History**, **SSE (real-time)**, and **Notifications & Scheduling** — the last
delivered over **three** channels: durable **in-app** notifications, **live SSE** push, and **email**.

**Source of truth:** `CLAUDE.md`, `standup-tracker-architecture.md`, `standup-tracker-workflow.md`, and the
existing backend code. The docs specify SSE + email delivery; the **persisted in-app notification inbox** is a
deliberate, confirmed extension — an *additive table in the existing Neon Postgres* (like `AiSummary`), **not**
a new datastore or new infra. Everything else stays strictly within what those files sanction. **No UI /
frontend / BFF work is in scope** — this is Express-only. Where a capability needs the frontend to finish the
loop (SSE polling fallback, rendering the inbox), the backend contract is defined and the client side is
explicitly deferred.

---

## Current state (grounding)

Already implemented and reused as-is:

- **Foundations:** `auth/authenticate` (per-request identity/team/role re-resolution), `auth/authorize`
  (`requireRole`), `auth/rateLimit`, `shared/validate` (Zod boundary), `shared/httpError` (`AppError` +
  terminal handler), `shared/ianaZones` (`timezoneSchema`, `SupportedTimezone`), `config/env`.
- **Tenant isolation:** `data-access/forTeam(teamId)` — the single choke point; every team query goes
  through it. `User`, `Standup`, `OnboardingToken`, `SessionRefreshToken`, `AiSummary` are team-scoped.
- **Domain modules:** `identity`, `teams` (`listRoster`, roster mgmt), `standups`
  (`submitStandup`, `editStandup`, `getMyToday`, `getMyRecent`, **`getTeamStandupsForDate`**),
  `insights` (cached, batched, degrading Gemini summary).
- **Timezone home:** `standups/localDate.ts` — `deriveLocalStandupDate`, `currentLocalDate` (Luxon,
  zone-aware, no manual offsets). **All** day/date logic in the new modules calls these; none re-derives.
- **Notifications:** only `notifications/notifications.seam.ts` — a dev-safe stub `enqueueEmail(kind, to, payload)`
  used by identity's invite/reset flows. `nodemailer` + `@types/nodemailer` are already dependencies.
- **Schema:** `Standup` already carries the two indexes these modules depend on —
  `@@index([userId, submittedAtUtc(sort: Desc)])` (latest-per-person, per-user history) and
  `@@index([teamId, localStandupDate])` (per-day team gather / date picker). `User` carries
  `@@index([teamId, isActive])` and a last-known `timezone`.

## Sequencing & dependencies

Reads first, then the live layer, then the notification backbone (persist + deliver + read) and its two
producers:

```
1  Dashboard read model ──────────────► 3  SSE live layer ──────────────┐
2  History (reuses 1 for team-day)         (per-recipient + board push)  │
                                                                         ▼
                                         4  Notification backbone: in-app store + email + read API
                                                    ▲                         ▲
5  Scheduler + member reminders ────────────────────┘                         │
6  Lead blocker alerts (in-app + email + live SSE) ───────────────────────────┘
```

Each phase is independently shippable, single-objective, and leaves the app production-ready at its boundary.
Total: **6 phases**.

## Cross-cutting rules honored in every phase (CLAUDE §13)

- Input validated with a Zod schema at the boundary (`validate(schema, …)`) before any logic.
- Every team-data query goes through `forTeam(auth.teamId)`; identity/team/role re-checked per request.
- All day/date logic uses the writer's IANA zone via `localDate.ts` — never server time or manual offsets.
- No tokens/PII/secrets in code or logs; secrets stay in env.
- Failures return clear, retryable-aware `AppError`s and never blank the primary experience.
- **No unsanctioned infra**: no Redis, WebSockets, broker, or second datastore. SSE + in-process TTL/queue
  only, plus one additive Postgres table for the inbox (architecture §9/§10, CLAUDE §9).
- Migration (Phase 4 only) runs against `DIRECT_URL`, never the pooler (CLAUDE §4/§12).

---

## Phase 1 — Dashboard read model (the lead's board)

**Objective:** the lead/owner-admin team board as a pure, tenant-scoped read model — latest update per
person, "no update yet" markers, blocker surfacing, and the date-picker view aligned to each person's own
day (architecture §2/§8/§18, workflow "team lead's dashboard" / "reading updates across time zones").

**New:** `src/dashboard/dashboard.schemas.ts`, `dashboard.service.ts`, `dashboard.routes.ts`,
`dashboard.integration.test.ts`. Shared: extract the `YYYY-MM-DD → UTC-midnight` calendar-date schema into
`src/shared/` (single source of shape) and re-point `insights.schemas` at it, so Dashboard, History, and
Insights share one definition (CLAUDE §7). Wire `app.use("/dashboard", dashboardRouter)` in `index.ts`.

**Routes** (all `authenticate → requireRole(LEAD, OWNER_ADMIN) → validate → operate → return`; a member is
403'd before any handler and never receives board markup or data — CLAUDE §5):

- `GET /dashboard` — the live board.
- `GET /dashboard?date=YYYY-MM-DD` — the date-picker board for a chosen past day.

**Service (`dashboard.service.ts`):**

- **Latest update per person** via the `[userId, submittedAtUtc desc]` index — `forTeam(teamId).standup
  .findMany({ orderBy: [{ userId }, { submittedAtUtc: "desc" }], distinct: ["userId"], select })`
  (DISTINCT-ON-style latest-row lookup). **Never** fetch-all-then-filter in memory (CLAUDE §4). Fallback if
  needed: one indexed `findFirst` per active roster member (still indexed, still tenant-scoped) — never a
  raw query on team data (data-access caveat).
- **"No update yet" (live board):** for each active roster member, compute their *current* local date with
  `currentLocalDate(member.timezone)` and mark anyone whose latest update's `localStandupDate` ≠ that date.
  Members with a null `timezone` (invited, never logged in) can't have a local day resolved — surface them
  as `pending`/no-update, consistent with the roster's `pending` status. Roster comes from
  `teams.listRoster` (cross-module via its service, per CLAUDE §3), backed by `[teamId, isActive]`.
- **Date-picker view:** delegate the day's team read to `standups.getTeamStandupsForDate(auth, date)`
  (already per-person-aligned on `localStandupDate`) and left-join it against the roster to compute per-member
  "no update on their personal version of that date." No new date math — the picked date is a resolved
  calendar date and each person's row for it *is* their personal version (architecture §8 "show me Monday").
- **Blocker surfacing:** the read model exposes a derived `hasBlocker = blockers.trim() !== ""` per card so
  the (UI-less) API already carries the signal the board highlights. Text is returned verbatim (escaped on
  render is the frontend's job — out of scope).
- Each card is labeled with its writer's own `localStandupDate`, `submittedAtUtc`, `timezone`, and `editedAt`
  marker — a Tuesday card beside a Monday card is correct and never normalized (architecture §8).

**Notes:** AI summary is **not** joined here — the board renders every real update independent of Insights
(CLAUDE §7). Read-only; no writes. Optionally back `listRoster` with the sanctioned in-process TTL cache
(architecture §10) — deferred unless profiling warrants it (avoid speculative complexity).

**DoD:** validated input · every query `forTeam`-scoped · role re-checked · per-person local dates via
`localDate.ts` · latest-per-person is an indexed lookup, not scan-and-filter · read-only, no infra added.

---

## Phase 2 — History (backward browsing)

**Objective:** per-member and per-team backward browsing of past days, aligned to each writer's real day
(architecture §2, workflow "Looking back: history and tracking"). Read-only; the edit window stays owned by
`standups` and is untouched.

**New:** `src/history/history.schemas.ts`, `history.service.ts`, `history.routes.ts`,
`history.integration.test.ts`. Wire `app.use("/history", historyRouter)` in `index.ts`.

**Routes:**

- `GET /history/me?cursor=…` — the caller's own paginated update timeline (any authenticated active user;
  own data only, no role gate — same posture as `standups /me/*`).
- `GET /history/team?date=YYYY-MM-DD` — the whole team's board for a chosen past day
  (`authenticate → requireRole(LEAD, OWNER_ADMIN)`).

**Service (`history.service.ts`):**

- **Member timeline:** the full-history extension of `standups.getMyRecent` (which caps at 7 for the home
  screen). Cursor pagination on the `[userId, submittedAtUtc desc]` index — `findMany({ where: { userId },
  orderBy: { submittedAtUtc: "desc" }, take: PAGE + 1, cursor?, skip: cursor ? 1 : 0 })`, scoped by
  `forTeam`; return the page plus a next-cursor. Paginated by design (architecture §15).
- **Team past-day:** delegate to `dashboard.service` (Phase 1) for the picked-date board so per-person date
  alignment and "no update yet" logic live in exactly one place — History adds the browsing surface, not a
  second copy of the alignment (avoids duplication; CLAUDE §3).

**Schemas:** reuse the shared calendar-date schema (Phase 1) for `date`; a `cursor` schema
(`z.cuid().optional()`) plus a bounded `PAGE_SIZE` constant.

**Notes:** because history reads pass through `forTeam`, a removed (soft-deactivated) user's past updates
still appear in the team's history (`Standup.onDelete: Restrict`) — the documented behavior (workflow "Remove
people"). Honest cross-timezone history: "last Monday" resolves to each person's own Monday for free, since
rows are keyed on `localStandupDate`.

**DoD:** validated input · `forTeam`-scoped · role re-checked (team route) · indexed pagination, no
scan-and-filter · team-day view delegates to Dashboard (no duplicated tz logic) · read-only.

---

## Phase 3 — SSE live layer (dashboard freshness + notification push)

**Objective:** push events to connected clients over **Server-Sent Events from Express** — a one-way stream,
no WebSockets (architecture §9, CLAUDE §9). Two event kinds ride the same connection: **board freshness**
("a new update landed", to leads/admins) and **recipient-addressed notifications** (used by Phases 4/6).

**New:** `src/realtime/realtime.hub.ts` (in-process registry + publish), `realtime.routes.ts` (the SSE
endpoint), `realtime.hub.test.ts`. Wire `app.use("/realtime", realtimeRouter)` in `index.ts`. Touch
`standups.service` to publish a board event after a successful write.

**Hub (`realtime.hub.ts`):** a registry of live connections, each tagged with `{ teamId, userId, role }`.
Two publish paths, both strictly inside the team partition (a client can **never** receive another team's
events — Golden Rule 2, enforced in the transport):

- `publishBoardEvent(teamId, event)` → delivered **only to LEAD/OWNER_ADMIN connections** of that team, so a
  member never receives other members' board activity (workflow: a member sees only their own updates). The
  event carries a minimal signal (event name + poster's `userId`/`localStandupDate`); the board revalidates
  through the Phase 1 read model — no full payload crosses the wire.
- `publishToRecipient(teamId, userId, event)` → delivered only to that one recipient's connections. This is
  the live channel for in-app notifications (Phases 4/6).

**Endpoint:** `GET /realtime/stream` — `authenticate` only (any active user may hold a stream, so members can
receive reminder pushes; board events are still filtered to leads/admins inside the hub). Set
`Content-Type: text/event-stream`, register the connection under `{ teamId, userId, role }`, send a periodic
heartbeat comment, emit an SSE `retry:` hint, and unregister on `req.on("close")`.

**Board publish path:** `standups.submitStandup` / `editStandup` call `realtime.publishBoardEvent(teamId, …)`
**after the transaction commits**, wrapped so a realtime failure can never fail or delay the write (Golden
Rules 8/9 — never lose an update; side effects off the critical path). Cross-module via `realtime`'s service
function (CLAUDE §3).

**Known baseline limitation (documented, not solved with infra):** the hub is **in-process per instance**, so
an event published on one Render instance does not reach a client connected to another. Acceptable in the
baseline: the client's short-interval revalidation/polling fallback keeps the board eventually correct, the
inbox (Phase 4) makes every notification durable regardless of connection, and Redis pub/sub is the sanctioned
upgrade — explicitly *not* added now (CLAUDE §9, architecture §9/§10). The frontend polling fallback is out of
scope; the backend keeps the read model + inbox authoritative so a missed live event is never a lost
notification.

**DoD:** identity re-checked · subscribers strictly team-partitioned and role-filtered for board events ·
board publish is post-commit and never breaks a write · connections cleaned up on close · no
WebSockets/broker/Redis added.

---

## Phase 4 — Notification backbone (in-app store + email + read API)

**Objective:** the core notification system — one dispatch path that fans a notification out to a **durable
in-app inbox row**, a **live SSE push**, and a **queued email**, plus the read surface to list and mark them
read. Email sending stays off the request path so a slow provider never blocks a user action (architecture
§9/§12/§16, CLAUDE §9). This is what Phases 5–6 dispatch through, and it upgrades the existing invite/reset
emails from stub to real delivery.

**New:** `src/notifications/notifications.transport.ts` (nodemailer transport from env),
`notifications.queue.ts` (in-process queue + async drain worker + backoff), `notifications.messages.ts`
(builds `{ title, body }` per notification type / email kind), `notifications.service.ts` (the `notify` +
read functions), `notifications.schemas.ts`, `notifications.routes.ts`, `notifications.service.test.ts`,
`notifications.queue.test.ts`. Keep `notifications.seam.ts`'s `enqueueEmail(kind, to, payload)` contract
intact (identity depends on it) — internally it now enqueues to the worker. Wire
`app.use("/notifications", notificationsRouter)` in `index.ts`.

**Migration (target `DIRECT_URL`) — the feature's only migration:** add a `Notification` model and a
`NotificationType` enum (`REMINDER`, `BLOCKER_ALERT`):

- Fields: `id`, `teamId` (tenant scope), `userId` (recipient), `type`, `title`, `body`, `dedupeKey`,
  `readAt DateTime?`, `createdAt`. `@@unique([teamId, dedupeKey])` (idempotency), `@@index([userId, createdAt(sort: Desc)])` (the inbox list).
- Register `"Notification"` in `data-access`'s `TEAM_SCOPED_MODELS` — the one-line wrapper change so every
  notification read/write is team-scoped automatically. No other tenant-model or wrapper change.

**Dispatch (`notify`)** — the single fan-out used by Phases 5/6, tenant-scoped via `forTeam`:

- **Idempotent create** keyed on `dedupeKey`: attempt `notification.create`; a duplicate raises Prisma P2002,
  caught and treated as an already-dispatched no-op (so no repeat inbox row, SSE, or email). The persisted row
  **is** the "already fired" record — this replaces the per-column idempotency markers entirely, so Phases 5/6
  need no migration of their own.
- On a *fresh* create only: `realtime.publishToRecipient(teamId, userId, …)` (live, best-effort, never
  throws) and `enqueueEmail` for the recipient (off request path). Failure of either side effect never rolls
  back the durable inbox row — the notification is never lost (Golden Rule 9).

**Read API** (all `authenticate`; own notifications only — recipient-scoped `where: { userId: auth.userId }`
under `forTeam`; no role gate, same posture as `standups /me/*`):

- `GET /notifications?cursor=…&unread=true` — the caller's inbox, newest first, paginated on
  `[userId, createdAt desc]`, optional unread filter; includes an unread count for a badge.
- `POST /notifications/:id/read` and `POST /notifications/read-all` — mark read (idempotent; sets `readAt`).

**Email transport/queue:** `enqueueEmail` pushes a built message and returns immediately (never throws
synchronously, never blocks — the seam's contract). A drain loop sends via nodemailer and retries transient
failures with exponential backoff, reusing the resilience shape proven in `insights.gemini.ts`
(`MAX_ATTEMPTS`, `BACKOFF_BASE_MS`, `isTransient`, time-box). On exhaustion it logs a failure with **no PII**
(no recipient/URL/token) and drops the message.

**Env additions** (`config/env.ts`, validated at boot; secrets, never logged — Golden Rule 10):
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE`. **Optional**, mirroring
`GEMINI_API_KEY`: unset (dev/test) → the queue keeps log-only behavior (kind only, no PII); set (production)
→ sends for real. The in-app inbox and SSE push work regardless of SMTP config.

**Baseline limitations (documented):** the email queue is in-process, so messages pending at a restart are
lost — acceptable because email here is low-volume/throttled and the design excludes a broker (architecture
§12/§17); the durable inbox row already survives restarts, and a durable queue is the sanctioned upgrade.

**DoD:** validated input · `forTeam`-scoped (inbox + dispatch); read recipient-scoped to `auth.userId` ·
dispatch idempotent on `dedupeKey`; durable inbox never lost if SSE/email fail · SMTP secrets in env only,
never logged; no PII in logs · enqueue non-blocking, off the request path · migration on `DIRECT_URL` ·
one additive table, no broker/second store.

---

## Phase 5 — Scheduler + member reminders

**Objective:** a **singleton** scheduler that, on a short interval, nudges each member near the start of
*their own* working day if they haven't posted for *their* current local day — timed to their local clock,
cleared implicitly on submit (architecture §8/§12, CLAUDE §6/§9). Each reminder is dispatched through the
Phase 4 `notify` (durable inbox + live SSE + email); nothing runs inside a request handler.

**New:** `src/notifications/notifications.scheduler.ts` (the singleton loop + advisory lock),
`notifications.reminders.ts` (the due-reminder evaluation), `notifications.reminders.test.ts`. Start the
scheduler from `index.ts` on boot. **No migration** — idempotency is the Phase 4 `dedupeKey`.

**Singleton guarantee:** the loop acquires a Postgres **advisory lock** (`pg_try_advisory_lock`) each tick;
only the holder dispatches, so horizontally scaling the web tier never multiplies reminders (architecture
§4/§13, CLAUDE §9). (Advisory-lock raw SQL is a system-level call, not team data — the data-access "no raw for
team data" caveat does not apply.)

**Tenant-safe cross-team iteration:** the scheduler serves all teams but must not break tenant scope. It
enumerates team ids once via the base client (`prisma.team.findMany({ select: { id: true } })` — a
system/bootstrap read, like signup's team creation, the only sanctioned non-`forTeam` team touch), then
processes **each team through `forTeam(teamId)`**, so every member/standup read stays team-scoped
(Golden Rule 2 holds even off-request).

**Reminder evaluation (`notifications.reminders.ts`), per team via `forTeam`:**

- For each active member with a known `timezone`: compute their current local time (Luxon) and current local
  date (`currentLocalDate`). If it is at/after their local morning reminder hour **and** they have no standup
  for their current `localStandupDate` → `notify` them with `dedupeKey = reminder:${userId}:${localDate}`.
  Members with a null `timezone` are skipped (no resolvable local day).
- One reminder per member per local day (the `dedupeKey` guard). Submitting flips the "no standup for today"
  condition false, so a submitted member is never nudged — clearing is implicit (architecture §12). The inbox
  row remains for the member to read/dismiss.

**Env additions:** `SCHEDULER_INTERVAL_MS` (short tick, e.g. default 5 min) and `REMINDER_LOCAL_HOUR`
(local morning hour, default 9) — scheduler configuration, not a user-facing timezone picker (still never
asked; captured from the browser, CLAUDE §6).

**DoD:** reminders evaluated against each user's local clock via `localDate.ts` · one-per-day idempotency via
`dedupeKey` · scheduler is a singleton (advisory lock) and never runs in a request · per-team reads via
`forTeam` · dispatch off the request path (Phase 4) · no new migration.

---

## Phase 6 — Lead blocker alerts (in-app + email + live SSE)

**Objective:** surface new and persistent blockers to leads/admins so they don't sit refreshing — as a
durable in-app notification and an email (Phase 4), plus an instant live push when a lead has the board open
(Phase 3). (architecture §9/§12, workflow "Nudges and alerts".)

**New:** `src/notifications/notifications.alerts.ts` (blocker evaluation + dispatch),
`notifications.alerts.test.ts`. Alert evaluation runs inside the existing Phase 5 scheduler tick (same
singleton, same per-team `forTeam` loop — no second scheduler). **No migration** — idempotency is the Phase 4
`dedupeKey`.

**Evaluation (per team via `forTeam`, each tick):** find current-local-day standups with a non-empty blocker;
resolve the team's recipients (leads + owner-admins) from `teams.listRoster` (cross-module via service); for
each recipient `notify` with `dedupeKey = blocker:${standupId}:${recipientUserId}` — one durable alert per
blocker per recipient, then in-app + email + live SSE via the Phase 4 fan-out. A blocker that has persisted
across ≥ N consecutive local days for the same member (a short indexed read over their recent standups via
`[userId, submittedAtUtc desc]`) is flagged **more urgent** than a fresh one in the message body, matching the
AI's persistence rule (architecture §11, workflow "who seems blocked").

**Live-on-submit path:** the Phase 3 board publish already fires post-commit on submit/edit; when the standup
has a non-empty blocker, also `notify` the team's leads/admins right then, so the alert is both instantly
pushed (to any connected lead) and durably stored — the scheduler's later pass is a no-op for it (same
`dedupeKey`).

**Scope discipline (avoid overengineering):** alerts stay per-member "new / persistent blocker." The
aggregate "several people waiting on the same thing" risk pattern is already produced by the existing AI
Insights summary (§11) and is **not** re-implemented here.

**DoD:** alerts idempotent (`dedupeKey`) — no repeat inbox rows/emails/pushes for a standing blocker ·
recipients scoped to the team's leads/admins via `forTeam`/`listRoster` · SSE push is recipient-addressed,
post-commit, and never breaks the write · email off the request path · durable inbox row survives a missed
live event · no new migration.

---

## Consolidated deltas

**New modules/dirs:** `src/dashboard/`, `src/history/`, `src/realtime/`; expanded `src/notifications/`
(`transport`, `queue`, `messages`, `service` with `notify` + read, `schemas`, `routes`, `scheduler`,
`reminders`, `alerts`) alongside the existing `seam`. **Shared:** one calendar-date schema extracted to
`src/shared/` (Phase 1). **`data-access`:** register `"Notification"` in `TEAM_SCOPED_MODELS` (Phase 4).
**`index.ts`:** mount `/dashboard`, `/history`, `/realtime`, `/notifications`; start the scheduler on boot.

**Notification channels:** durable **in-app inbox** (`Notification` table, listable + mark-read) · **live
SSE** push (recipient-addressed) · **email** (queued, backoff, off request path). A missed live event is
never a lost notification — the inbox row is authoritative.

**Env additions:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` (Phase 4,
optional); `SCHEDULER_INTERVAL_MS`, `REMINDER_LOCAL_HOUR` (Phase 5).

**Migration (single, on `DIRECT_URL`):** the `Notification` model + `NotificationType` enum (Phase 4). Its
unique `dedupeKey` doubles as the reminder/alert idempotency record, so Phases 5 & 6 add **no** further
migrations and no extra columns. No new tables beyond this; the tenant-scoping wrapper gains one entry.

**Explicitly NOT added** (kept out per CLAUDE §9 / architecture §10): Redis, WebSockets, a message broker, a
second datastore, or a timezone picker. Cross-instance SSE fan-out and a durable email queue are named,
documented upgrade paths — not baseline work. All UI/BFF/frontend work (including rendering the inbox and the
SSE polling fallback) is out of scope.
