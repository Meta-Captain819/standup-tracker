# Standup Tracker — Current Status Report

*Source of truth: direct inspection of every file in the repo (backend source tree, Prisma schema/migration/config, tests, both `package.json`s, and the frontend). Nothing inferred beyond what is present in the files.*

---

## Overview

The project is **two apps in very different states**. The **Express backend is substantially built** — real domain modules, tenant isolation, auth, timezone logic, and the full AI pipeline, with tests. The **Next.js frontend is completely untouched** — still the default `create-next-app` scaffold. So there is a working (partial) API with **no user interface, no BFF, and no cookie/session layer** in front of it.

> Note: `CLAUDE.md` §3 describing the backend as a "bare scaffold" is **stale** — the backend is far more complete than that. This report reflects the actual files.

---

## ✅ Fully implemented (backend)

### Foundation & infrastructure
- **Env validation** (`config/env.ts`) — Zod-validated, fail-fast at boot, secrets never logged; Gemini key optional by design.
- **Prisma schema + init migration** (`prisma/schema.prisma`, `prisma/migrations/20260708120000_init/migration.sql`) — all 6 tables (Team, User, Standup, OnboardingToken, SessionRefreshToken, AiSummary), every tenant row carries `teamId`, correct indexes (per-user latest-row, `[teamId, localStandupDate]`), `@db.Date`/`@db.Timestamptz` types, and the `(userId, localStandupDate)` unique constraint.
- **Pooled/direct split** — runtime uses `DATABASE_URL` via pg adapter (`db/prisma.ts`); migrations use `DIRECT_URL` (`prisma.config.ts`). Matches the golden rule exactly.
- **Tenant-scoping wrapper** (`data-access/index.ts`) — a Prisma `$extends` query extension that injects `teamId` into every read/write/upsert for tenant models and blocks `Team` lifecycle ops. This is the single choke point mandated by §2.2/§4, and it's real.
- **Error handling** (`shared/httpError.ts`) — typed `AppError`, terminal handler, Prisma-error normalization, retryable flags, no internal leakage.
- **Zod boundary validation** (`shared/validate.ts`) + **IANA allow-list** (`shared/ianaZones.ts`, ~48 zones, boot-checked via Luxon).

### Auth & security (`auth/`)
- Argon2id password hashing; per-request `authenticate` (re-resolves user/team/role/active from DB every call); `requireRole` guard; HS256 access tokens + rotating hashed refresh tokens with **reuse detection** that burns the chain; rate limiters for auth and AI endpoints.

### Identity & Access module (`identity/`)
- Signup (atomic team+owner+session), login (with timezone capture), refresh, logout, `/me`, invite accept, forgot/reset password. All Zod-validated, transactional, no user enumeration.

### Teams & Membership module (`teams/`)
- Provision team, add member (creates PENDING user + issues invite), list roster, set role (LEAD/MEMBER only), remove (soft-deactivate). Includes a **"last owner-admin" guard**. Owner-admin gated.

### Standups module (`standups/`)
- The highest-risk timezone logic is done: `deriveLocalStandupDate`/`currentLocalDate` via Luxon (`localDate.ts`), idempotent upsert on `(userId, localStandupDate)`, edit-window enforcement (current local day must match), non-blank Zod rule, self-scoped reads (`getMyToday`, `getMyRecent`).

### AI Insights module (`insights/`)
- Fully wired end to end: Postgres-cached summaries keyed by `(teamId, standupDate)` with content **fingerprint** for staleness, grounded summarize-only prompt with prompt-injection framing, batched single Gemini call, time-boxed + backoff retry client that never throws, Zod output validation, and **graceful degradation to "unavailable"**. Lead/admin-gated and rate-limited.

### Tests
- 38 test cases across 6 files: pure unit suites (prompt, schemas, localDate) run always; integration suites (standups, teams) run against a live Neon-branch DB and skip when `DATABASE_URL` is unset.

---

## 🟡 Partially done

- **Notifications & Scheduling** — only a **dev stub seam** (`notifications.seam.ts`) that `console.log`s "queued". No real SMTP delivery, no queue/backoff/retry, **no scheduler**, no member reminders, no lead alerts. `nodemailer` is installed but unused. The folder contains nothing else.
- **History** — only the member's own last-7 (`getMyRecent`) exists. There is **no per-team past-day browsing module or endpoint** (architecture §2 "History"). `getTeamStandupsForDate` exists but only as a grounding seam consumed by AI, not exposed as a history/dashboard route.
- **Shared Zod package** — does not exist. Field rules are **hand-copied** between `identity.schemas.ts` and `teams.schemas.ts` (the code itself flags this as a known gap). No `packages/shared`, no workspace tooling.

---

## ❌ Not started

### Entire frontend (`frontend/standup-tracker/`)
Still the default `create-next-app` template. `app/page.tsx` is the Next.js welcome page. This means **none** of the following exist:
- No welcome/sign-in/start-a-team screens, member home, update form, or lead dashboard UI
- **No BFF route handlers** — the whole "thin BFF forwards a bearer token server-side" layer is absent
- **No httpOnly cookie session / CSRF defense** — the backend currently returns tokens in JSON response bodies (by design, awaiting the BFF to set the cookie), so the "tokens never reach the browser" invariant is **not yet realized end-to-end**
- No middleware role-based routing, no optimistic submit UI, no browser timezone capture, no date picker

### Dashboard / Read Models module (backend)
The lead's "at a glance" board is **not built**: no latest-update-per-person endpoint, no "no update yet" markers, no blocker surfacing, no per-person date-picker alignment query. Only the AI grounding seam touches team-wide standups.

### Other
- **Real-time (SSE)** — none. No Express SSE stream, no polling fallback.
- **In-process TTL cache** for roster/roles (architecture §10) — not implemented (only the AI Postgres cache exists).
- **Ops/deploy** — no `.env.example`, no Dockerfile/Render or Vercel config, no CI, no Sentry/structured error tracking wiring (only `console.error`).

---

## Module scorecard (per architecture §2)

| Module | Status |
|---|---|
| Identity & Access | ✅ Fully built |
| Teams & Membership | ✅ Fully built |
| Standups (incl. timezone core) | ✅ Fully built |
| AI Insights | ✅ Fully built |
| Tenant-scoping + Auth foundation | ✅ Fully built |
| Notifications & Scheduling | 🟡 Stub only |
| History | 🟡 Member-only partial |
| Dashboard / Read Models | ❌ Not started |
| Frontend (UI + BFF + session) | ❌ Not started |
| Real-time (SSE) | ❌ Not started |

---

## Bottom line

The **backend's hard parts are genuinely done and done well** — multi-tenant isolation, the writer-local-day timezone engine, auth with refresh-token rotation/reuse detection, and a properly-degrading cached AI pipeline, all Zod-validated and tenant-scoped per the golden rules.

What remains is roughly:
1. The entire frontend + BFF + cookie session layer
2. The lead Dashboard read-model backend module
3. Real Notifications/scheduler
4. Team History
5. SSE real-time

The product is **not yet usable by anyone** because there is no UI and no way to view the team board — but the domain core it would sit on is largely in place.
