# Implementation Plan — Standups & Members Management

Phased, production-ready plan for the **Standups** and **Teams & Membership (members management)** backend modules. Derived solely from `CLAUDE.md`, `standup-tracker-architecture.md`, and `standup-tracker-workflow.md`. Where the architecture doc and `CLAUDE.md` disagree, the architecture doc wins (`CLAUDE.md` §1).

All work is in **`backend/`** (Express on Render). No UI is in scope. The Next.js BFF is referenced only where it defines a server-side contract Express must honor.

> **This plan covers only work that is not yet built.** The shared foundation, the full data model, and the entire Identity & Access module are already implemented (see Baseline). Everything below assumes those exist and reuses their seams rather than rebuilding them.

---

## Baseline — what already exists (do not rebuild)

Delivered by the completed `auth-implementation-plan.md` and `standup-tracker-database-plan.md`. Verified in the tree on 2026-07-08:

**Foundation & app (equiv. of a "scaffold + error/env" phase — complete)**
- `src/index.ts` — Express bootstrap, `trust proxy`, CORS locked to `env.CORS_ORIGIN`, `morgan`, JSON body, `/health`, `/auth` router mounted, terminal error handler last, graceful shutdown.
- `src/config/env.ts` — Zod-validated env, fail-fast at boot, no secret leakage.
- `src/shared/httpError.ts` — `AppError` + terminal `errorHandler` (structured, retryable-aware, Prisma-error normalization, never leaks internals).
- `src/shared/validate.ts` — `validate(schema, data)` boundary parser used at the top of every handler.

**Data model & DB (complete — including the Standup table)**
- `prisma/schema.prisma` — `Team`, `User`, `Standup`, `OnboardingToken`, `SessionRefreshToken`, `AiSummary`. `teamId` on every tenant-owned row.
  - **`Standup` already has** `yesterday`, `today`, `blockers`, `submittedAtUtc`, `timezone`, `localStandupDate` (`@db.Date`), `editedAt`, **`@@unique([userId, localStandupDate])`**, `@@index([userId, submittedAtUtc desc])`, `@@index([teamId, localStandupDate])`. **No new migration is required for standups.**
  - `User` has `passwordHash String?` (null until invite accepted), `role`, `timezone String?`, `isActive` (soft-deactivation for removal), `@@index([teamId, isActive])`.
- `prisma/migrations/…_init/` applied against the direct endpoint; runtime uses the pooled endpoint via the pg adapter (`src/db/prisma.ts`).

**Tenant scoping & validation primitives (complete)**
- `src/data-access/index.ts` — `forTeam(teamId)` tenant-scoping client (injects `teamId` into every `where`/`data`, blocks `Team` lifecycle ops). `TenantClient` type. Base `prisma` reserved for sanctioned pre-tenant lookups.
- `src/shared/ianaZones.ts` — `SUPPORTED_TIMEZONES` allow-list, `isSupportedTimezone`, and the reusable `timezoneSchema`.

**Auth foundation & Identity module (complete)**
- `src/auth/` — `passwords.ts` (Argon2id), `session.ts` (`issueSession`/`rotateSession`/`revokeSession`/`revokeAllSessionsForUser`), `tokens.ts` (access JWT + hashed opaque tokens), `authenticate.ts` (per-request bearer verify + DB re-resolution of `{userId, teamId, role}`, active check), `authorize.ts` (**`requireRole(...)`**), `rateLimit.ts` (**`authRateLimiter`**).
- `src/identity/` — `signup` (atomic team + owner-admin), `login` (timezone capture), `refresh`, `logout`, `getProfile` (`/auth/me`), plus onboarding: `acceptInvite`, `requestPasswordReset`, `resetPassword`, and the **`issueInviteToken(userId)`** seam. Routes at `/auth/*`, all rate-limited and Zod-validated.
- `src/teams/teams.service.ts` — **`provisionTeam(tx, {name})`** seam only.
- `src/notifications/notifications.seam.ts` — **`enqueueEmail(kind, to, payload)`** off-request-path stub (real SMTP worker is the Notifications module, out of scope).

### Seams this plan consumes (already built)
`forTeam(teamId)` · `requireRole(...)` · `authenticate` · `validate` · `timezoneSchema` · `AppError` · `issueInviteToken(userId)` · `enqueueEmail(...)` · `provisionTeam(...)` · the `Standup`/`User` Prisma models.

---

## Scope of remaining work

**In scope**
- **Teams & Membership (members management)** — the roster HTTP surface that does not yet exist: add member (via the `issueInviteToken` seam), list roster, set/change role, remove member (soft-deactivate). (`CLAUDE.md` §3; Architecture §2; Workflow "Running the team".) The auth plan explicitly deferred this surface (auth plan §5.3).
- **Standups** — the module does not exist yet: writer-local-day resolution, submit, edit, and member read of own updates. (Architecture §2, §8; Workflow "Writing today's update", "editing", "the home screen".)

**Out of scope** (separate modules; their tables/seams already exist so they can be built later without rework): Dashboard/Read Models, AI Insights (`AiSummary` table already present), Notifications & Scheduling (SMTP worker/reminders), History browsing, SSE. CSRF/cookie handling lives on the Next.js BFF; Express is stateless bearer-token and has no cookie surface (auth plan §5.4).

**Standing constraints (every phase)** — Express is the single source of truth; every tenant query goes through `forTeam`; "today" is the writer's local day from a UTC instant + IANA zone (no server time / manual offsets); Zod-validate then re-authorize (identity + team + role) on every request; idempotent upserts; never lose an update; secrets stay in env; no Redis/WebSockets/queue/second store added. (`CLAUDE.md` §2, §11.)

**Dependency order:** 1 → 2 (members), and 3 → 4 → 5 (standups) — independent of members. Phase 6 applies across 1–5. **Six phases total.**

---

## Phase 1 — Members management: add member & list roster

**Objective:** Give the owner-admin the ability to create accounts and see the roster — the only way members come to exist (Workflow "The admin creates everyone else").

**New files:** `src/teams/teams.schemas.ts`, `src/teams/teams.routes.ts`; extend `src/teams/teams.service.ts`. Mount `app.use("/teams", teamsRouter)` in `src/index.ts`.

**Deliverables**
- Zod schemas: `addMemberSchema` (name + email, reusing the same normalized `email`/`displayName` field rules as identity; **flag** that these field rules should be shared, not re-copied — same gap already recorded in `identity.schemas.ts`), and any list query params.
- `addMember` service: through **`forTeam(teamId)`**, create a **PENDING** `User` (role `MEMBER`, `passwordHash: null`, `isActive: true` — login is blocked by the null hash until acceptance), then call the existing **`issueInviteToken(user.id)`** seam to mint the hashed invite and enqueue the email. Duplicate email → `409` via the existing Prisma `P2002` mapping. The account is tied to exactly one team by the scoping wrapper.
- `listRoster` service: team-scoped read of members (id, name, email, role, active/pending status) via `forTeam`, using the existing `@@index([teamId, isActive])` — never a cross-team or fetch-all query.
- Routes: `POST /teams/members`, `GET /teams/members`. Each: `authenticate` → **`requireRole(Role.OWNER_ADMIN)`** → `validate` → service → scoped result.

**Definition of done:** Only an owner-admin can add/list; adding a member creates one PENDING user in the caller's team and enqueues exactly one invite; a member/lead caller is blocked with `403` and sees nothing; the created user cannot log in until they accept.

---

## Phase 2 — Members management: role change & removal

**Objective:** Complete the admin control surface — promote/demote and remove access while preserving history (Workflow "Set and change roles", "Remove people").

**Files:** extend `src/teams/{teams.schemas,teams.routes,teams.service}.ts`.

**Deliverables**
- `setRole` service: flip a member ↔ `LEAD` (never grant `OWNER_ADMIN` through this endpoint) via `forTeam`. Because `authenticate` re-resolves role from the DB every request, a demotion takes effect on the target's very next call — no extra invalidation needed.
- `removeMember` service: **soft-deactivate** (`isActive: false`) via `forTeam` — the schema's `Standup.onDelete: Restrict` forbids a hard delete, so past standups remain in team history (Workflow "Their past updates stay"). A removed user fails `authenticate`'s active check immediately.
- Guardrails: an owner-admin cannot demote or remove themselves in a way that leaves the team ownerless (reject the self-removal / self-demotion of the sole owner-admin). This is an integrity rule implied by "there's always a clear owner" (Workflow "A few decisions"); no new concept introduced.
- Routes: `PATCH /teams/members/:userId/role`, `DELETE /teams/members/:userId`. Params Zod-validated; `authenticate` → `requireRole(OWNER_ADMIN)` → `validate` → service. All operations team-scoped, so a `:userId` from another team simply does not match.

**Definition of done:** Owner-admin can promote/demote and remove; a removed user can no longer authenticate but their standups persist; the last owner-admin cannot orphan the team; a cross-team `:userId` yields not-found, never another team's row.

---

## Phase 3 — Standups: writer-local-day resolution service

**Objective:** Centralize the highest-risk logic (`CLAUDE.md` §6) into one small, tested module the standup handlers consume — no day/date math anywhere without the writer's IANA zone in hand.

**New file:** `src/standups/localDate.ts` (timezone resolution is a Standups responsibility per Architecture §2).

**Deliverables** (built on the already-installed Luxon; never manual offset math; never assume a zone is DST-free — `CLAUDE.md` §6)
- `deriveLocalStandupDate(submittedAtUtc, ianaZone)` → the calendar date (`@db.Date`-compatible) of that instant in the writer's zone. This is the value everything hinges on.
- `currentLocalDate(ianaZone)` → the writer's current local date, computed live, for the edit-window check and future "no update yet" logic.
- Inputs are already-validated `SupportedTimezone` values (reuse `isSupportedTimezone`/`timezoneSchema`); the IANA name is used, never a stored offset.

**Definition of done:** For one fixed UTC instant the service returns Tuesday for `Asia/Karachi` and Monday for `America/Los_Angeles`; a Berlin and an SF DST-boundary instant each resolve to the correct local date; Karachi (no DST) is stable. Covered by explicit cases in Phase 6.

---

## Phase 4 — Standups: submit (idempotent upsert)

**Objective:** Accept the three-question update as an idempotent, atomic, writer-local-day write (Workflow "Writing today's update"; Architecture §7, §8).

**New files:** `src/standups/standups.schemas.ts`, `src/standups/standups.service.ts`, `src/standups/standups.routes.ts`. Mount `app.use("/standups", standupsRouter)`.

**Deliverables**
- `submitStandupSchema`: three text fields + captured `timezone` (reuse `timezoneSchema`). Encodes the product rule directly — short text allowed, empty `blockers` allowed, **reject only the fully-blank (all three empty) case** (`CLAUDE.md` §7). Not enforced ad hoc in the handler.
- `submitStandup` service: refresh the user's last-known `timezone`; derive `localStandupDate` via Phase 3; perform an **idempotent upsert keyed on `(userId, localStandupDate)`** through **`forTeam(teamId)`**, inside a **transaction**, storing `submittedAtUtc` + `timezone` + `localStandupDate` + the three answers. A retried submit reconciles onto the existing row (the unique key already exists) — never a duplicate (`CLAUDE.md` §8; Architecture §16).
- Returns the saved update so the client can confirm "done"; on failure returns a **clear, retryable `AppError`** without discarding input (`CLAUDE.md` §9). Standup text is stored verbatim and treated as untrusted downstream (escaped on render, summarize-only at the AI boundary — those consumers are out of scope, but the text is not sanitized-away here).
- Route: `POST /standups` — `authenticate` → `validate` → service (any active user may post their own update; no role gate). Per docs, rate limiting is mandated only for auth and AI endpoints, so none is added here (`CLAUDE.md` §5).

**Definition of done:** Two identical submits for one local day produce one row (upsert), not two; a fully-blank submit is rejected before any DB write; a Karachi user and an SF user submitting at the same instant are filed under their own, different `localStandupDate`.

---

## Phase 5 — Standups: edit & member read of own updates

**Objective:** Same-day editing and the read paths a member needs for their own home screen (Workflow "editing", "the home screen"; Architecture §8).

**Files:** extend `src/standups/{standups.schemas,standups.service,standups.routes}.ts`.

**Deliverables**
- `editStandup` service: permitted **only while `currentLocalDate(userZone)` equals the update's stored `localStandupDate`** (Phase 3); once the writer's day has rolled over the update is read-only history and edits are rejected. A successful edit keeps the latest text and sets **`editedAt`** (the edited marker). Same non-blank rule as submit; scoped via `forTeam`.
- `getMyToday` / `getMyRecent` services: the caller's **current-day** update (to confirm/tweak) and their **last few days** of updates, scoped to the caller only via `forTeam`, using `@@index([userId, submittedAtUtc desc])` — the indexed per-user lookup, never fetch-all-then-filter (`CLAUDE.md` §4). A member sees only their own updates.
- Routes: `PATCH /standups/:id` (or upsert-by-day, consistent with Phase 4's key), `GET /standups/me/today`, `GET /standups/me/recent`. All `authenticate` → `validate` → service, team- and self-scoped.

**Definition of done:** Editing today's update marks it `editedAt`; editing after the writer's local day has rolled over is rejected as read-only; the read endpoints return only the caller's own updates (today + recent), and a member cannot read anyone else's.

---

## Phase 6 — Verification of the new endpoints

**Objective:** Prove the two new modules meet the invariants before calling them production-ready. Only the new surfaces are exercised — the foundation is already verified by the prior plans.

**Deliverables** (automated tests; runner is an implementation detail — the source docs name none)
- **Tenant isolation** — a caller from team A cannot add/list/role/remove team B's members, nor read/write team B's standups, through any Phase 1–5 endpoint (relies on `forTeam`).
- **Timezone correctness** — `deriveLocalStandupDate` / `currentLocalDate` across Karachi, Berlin (DST boundary), and San Francisco (DST boundary), plus the same-instant/different-day case.
- **Idempotency** — a retried submit/edit reconciles to one row on `(userId, localStandupDate)`.
- **One-per-day & non-blank** — enforced at the schema and unique-constraint level.
- **Role gating** — member/lead blocked from owner-admin roster endpoints; the last-owner-admin guard holds; a removed user fails `authenticate` and their standups survive.
- **Edit window** — editable on the writer's current local day; read-only after rollover.
- Run against a **Neon branch**, never production; confirm no schema change was needed for standups (table pre-exists) and none was introduced.
- Walk the `CLAUDE.md` §13 Definition-of-Done checklist for each new endpoint.

**Definition of done:** All invariant tests pass on a Neon branch; the §13 checklist holds for every endpoint added in Phases 1–5; no unsanctioned infrastructure (Redis, WebSockets, queue broker, second store) was introduced.

---

## Invariant coverage map (golden rule → phase)

| `CLAUDE.md` Golden Rule | Enforced in |
|---|---|
| 1. Express is source of truth | all (backend-only) |
| 2. Every tenant query team-scoped | 1, 2, 4, 5, 6 (via existing `forTeam`) |
| 3. "Today" belongs to the writer | 3, 4, 5 |
| 4. Validate every boundary with Zod first | 1, 2, 4, 5 (via existing `validate`) |
| 5. Re-authorize every request | 1, 2, 4, 5 (via existing `authenticate` + `requireRole`) |
| 6. Tokens never reach the browser | reused from Identity (no new token surface) |
| 7. AI never on critical path | out of scope; standup text stored untrusted-safe (4) |
| 8. Submits idempotent | 4, 5 (existing unique key) |
| 9. Never lose a written update | 4, 5 |
| 10. Secrets stay in env | reused from foundation |

---

## Known gaps carried over (not this plan's scope, but recorded)
- **Shared Zod package** — `backend` and `frontend/standup-tracker` are still not one workspace, so the new `teams`/`standups` schemas remain backend-owned; the BFF must reuse the same shapes rather than hand-copy. Same gap already flagged in `identity.schemas.ts` (`CLAUDE.md` §3, §7).
- **Error tracking (e.g. Sentry)** — the terminal handler currently logs server faults to console only; wiring an error tracker (Architecture §16) is cross-cutting infra, not specific to these two modules.
- **Notifications SMTP worker** — `enqueueEmail` is still the dev stub; the real queued/backoff worker is the Notifications module.
