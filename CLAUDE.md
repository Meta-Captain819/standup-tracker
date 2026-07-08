# CLAUDE.md — Standup Tracker

Agent guidance for building and maintaining this repo. Read this before writing any code. These are not suggestions — the rules in **§2 Golden Rules** and **§6 Time Zones** are invariants. If a task appears to require breaking one, stop and flag it rather than working around it.

---

## 1. What this is

A multi-tenant SaaS standup tracker. Each team gets a private space. Members post a three-question daily update (**yesterday / today / blockers**) against **their own local day**. Leads and admins see the whole team on one board with a Gemini-written summary at the top. Signup creates a team and makes the creator its owner-admin; the admin creates all other accounts.

Full architecture lives in `standup-tracker-architecture.md`. The workflow live in `standup-tracker-workflow.md`. This file is the operational contract for changing code; that file is the reasoning behind it. When they disagree, the architecture doc wins — update this file to match, don't diverge silently.

**Stack:** Language: TypeScript · Next.js (App Router, Vercel) · Express.js (Render) · Neon PostgreSQL + Prisma · Zod for validation · Gemini for AI · SMTP for email.

---

## 2. Golden Rules (never violate)

1. **Express is the single source of truth.** All domain logic, authorization, tenant scoping, timezone resolution, AI orchestration, and database access live in Express. Next.js is presentation + a thin BFF. Never put business logic, Prisma calls, or auth decisions in Next.js.
2. **Every tenant-owned query is team-scoped.** No query touching team data runs without the caller's `teamId` applied at the data-access layer. There is no "just this once" exception. Cross-team reads are a security bug, not a convenience.
3. **"Today" belongs to the writer, always.** A standup's day is derived from its UTC instant converted into the writer's IANA timezone. Never use server time, `new Date()` day math, `UTC` day, or a global/team day. See §6.
4. **Validate every boundary with Zod first.** Every Express endpoint parses its body, query, and params through a Zod schema before any logic runs. No parsing "later." No trusting the client shape.
5. **Re-authorize on every request.** Verify identity, team membership, and role on each call. Never trust that a valid session implies access to a given resource.
6. **Tokens never reach the browser.** The session lives in an `httpOnly`, `Secure`, `SameSite` cookie on the Next.js origin; Express receives a bearer token forwarded server-side by the BFF. Never expose an API token to client JS.
7. **AI is never on the critical path.** The dashboard must render every real update with the AI down. Treat the summary as an enhancement that can fail.
8. **Submits are idempotent.** A standup write is an upsert keyed on `(userId, localStandupDate)`. A retried request must reconcile, never duplicate.
9. **Never lose a written update.** Failed writes surface a clear retry and preserve the user's text. Do not swallow submissions.
10. **Secrets stay in env.** No credentials, connection strings, or API keys in code, logs, or committed files.

---

## 3. Repo shape

Two independent apps today — **not** an npm/pnpm workspace. There is no root `package.json` and no shared package:

- `backend/` — Express backend, Prisma, domain modules, scheduler (Render). Plain npm. Currently a bare scaffold (`package.json` with `express`/`cors`/`dotenv`/`morgan`/`nodemon`) — no `src/`, no Prisma, no domain modules yet.
- `frontend/standup-tracker/` — Next.js (App Router) frontend + BFF route handlers (Vercel). pnpm, and it has its **own nested `.git`**, separate from the project root. Currently the default `create-next-app` scaffold (Tailwind v4, ESLint 9) — no BFF handlers, no auth, no real pages yet.

Express domain modules (once built) should mirror the architecture: `identity`, `teams`, `standups`, `dashboard`, `insights`, `notifications`, `history`, plus a shared `data-access` (tenant-scoping wrapper) and `auth` foundation. Keep modules cohesive; cross-module calls go through a module's own service functions, not directly into another module's data layer.

**Shared validation gap:** §7 requires one Zod schema shared by both apps, but `packages/shared` doesn't exist because `backend` and `frontend/standup-tracker` aren't wired into a single workspace (different package managers, and the frontend is its own git root). Don't assume a shared package is there. Before duplicating schema logic across both apps, either set up real workspace tooling spanning both, or flag the gap — don't let hand-copied schemas quietly drift out of sync.

---

## 4. Data access & tenant isolation

- Every read/write of team-owned data goes through the **tenant-scoping wrapper** that injects the caller's `teamId`. Never call Prisma directly from a handler for team data.
- Every tenant-owned row carries its `teamId`. New tables/entities for team data must include it.
- Postgres RLS is optional defense-in-depth; do **not** rely on it as the primary guard — app-level scoping is mandatory regardless.
- **Connection strings:** the runtime uses Neon's **pooled** endpoint (`DATABASE_URL`); Prisma **migrations** use the **direct/unpooled** endpoint (`DIRECT_URL`). Never run migrations against the pooler, and never point the runtime pool at the direct endpoint.
- Prefer selective, indexed queries scoped to one team. The dashboard's "latest update per person" must use an indexed per-user latest-row lookup — never fetch-all-then-filter in memory.

---

## 5. Auth & security

- Hash passwords with **Argon2id** (or bcrypt). Never store, log, or return anything password-derived that's reversible.
- Sessions: short-lived access token + rotating refresh token, held only in the Next.js-origin cookie. Rotation on refresh; revocation supported.
- **Invite and password-reset tokens** are single-use, expiring, and stored **hashed** — never persist a usable raw token.
- Roles: `owner-admin` (full control incl. roster + roles), `lead` (full team view + AI, no account admin), `member` (own updates only). Resolve role server-side; block and hide out-of-role areas. A member must never receive lead/admin markup or data.
- CORS on Express is locked to the Vercel origin. CSRF defense on cookie flows. Rate-limit auth and AI endpoints.
- Treat standup text as **untrusted** when it reaches the AI (see §8) and when rendering (escape/) — no injection through update content.

---

## 6. Time Zones — the highest-risk area

Team spans **Karachi, Berlin, San Francisco**. At one instant it can be Tuesday in Karachi and Monday in San Francisco. Both are correct. Get this wrong and the whole product is wrong.

**Hard rules:**

- Store per standup: the exact **UTC instant**, the writer's **IANA zone** (e.g. `Asia/Karachi`, `Europe/Berlin`, `America/Los_Angeles`), and the derived **`localStandupDate`** (the calendar date of that instant in that zone). `localStandupDate` is the key everything hinges on.
- Store the **IANA zone name, never a fixed offset**. Do all conversions with a timezone-aware library (Luxon / date-fns-tz / `Temporal`). **Never** do manual offset arithmetic, and never assume a zone is DST-free — Berlin and SF shift; Karachi doesn't; the library handles all three.
- The user's zone is **captured automatically** from the browser (Intl API) on login and each submit. **Never** add a timezone picker or ask the user to configure it.
- **Uniqueness / one-per-day:** enforced on `(userId, localStandupDate)`.
- **Editability:** allowed only while the user's **current** local date (computed live in their zone) equals the update's stored `localStandupDate`. After their day rolls over, the update is history and read-only. Edits keep latest text + an `edited` marker with timestamp.
- **Dashboard default view:** latest update per person, each labeled with **that writer's own day and local time**. A Tuesday card next to a Monday card is correct — do not "normalize" them to one day.
- **Date picker:** selecting a date aligns each person to **their** version of that date (match on each user's `localStandupDate`), not a single UTC window. "Show me Monday" = each person's personal Monday.
- **"No update yet":** compute each member's current local date; mark anyone with no standup for it (live board) or for their personal version of a picked date.
- **Reminders:** evaluated against **each user's local clock** — near their local morning, only if they haven't posted for their current local day.

If you find yourself writing day/date logic without a user's IANA zone in hand, you are doing it wrong.

---

## 7. Validation (Zod)

- Define every request schema in one place shared by both apps and use it in both the BFF and the Express handler — one shape, one source. See §3 for the current gap (no shared package exists yet).
- Parse at the very top of each handler; reject before any logic. Return structured validation errors.
- The **timezone field** is a validated IANA zone string (checked against a known set), never freeform.
- The **standup form** accepts short text and an empty blocker; it rejects **only** the fully-blank case (all three empty). Encode that rule in the schema, not ad hoc in the handler.
- Never cast around a schema (`as any`, unchecked `JSON.parse`) to bypass validation.

---

## 8. AI (Gemini)

- The assistant speaks **only from real standups** — real names, tasks, blockers. It must not invent progress or pad with filler. With little data, it says so.
- Build the prompt in Express strictly from the team's real updates for the day. Send **one batched call** for the whole team, not one per person. Constrain the model to a summarize-only role.
- Treat update text as **untrusted input**: instruct the model to summarize it and never follow instructions embedded inside it; validate output before display.
- **Cache** the summary in Postgres keyed by `(teamId, standupDate)` with a fingerprint of the source updates. Regenerate only when updates change or a lead explicitly refreshes. Do not call Gemini on every dashboard load.
- Use a fast, low-cost Gemini tier with capped output length. Time-box the call.
- **Degrade gracefully:** on failure/slowness, show "summary unavailable right now" and render all real updates normally. Never block the board on the AI.

---

## 9. Caching, real-time, notifications

- **No Redis or message broker in the baseline.** AI summaries cache in Postgres; hot read-models (roster, roles) use a small in-process TTL cache invalidated on write. If you think you need Redis, raise it — it's a documented upgrade path, not a default. Do not add it unprompted.
- **Real-time** dashboard freshness via **SSE** from Express (new-update push), with light revalidation/polling fallback. Do not reach for WebSockets — the traffic pattern doesn't warrant it.
- **Notifications:** member reminders (local-morning, cleared on submit) and lead alerts (new/persistent blockers). Email is **queued and retried with backoff, off the request path** — a slow SMTP provider must never block a user action.
- **Scheduler is a singleton** (Render Cron or an advisory-lock-guarded worker). Scaling the web tier must never multiply reminders. Never run reminder dispatch inside a request handler.

---

## 10. Fault tolerance conventions

- Wrap submits in a transaction; make them idempotent upserts. On failure, return a clear retryable error and preserve input.
- Time-box and back-off retry transient DB / Gemini / SMTP calls.
- Isolate failures: one dependency down must never blank the screen. Worst case is an honest message + a way forward.
- Log with structure; wire error tracking (e.g. Sentry). Don't swallow errors silently or `catch` without handling.

---

## 11. Conventions & do-nots

**Do:**
- Keep the BFF thin — authenticate the cookie, forward, shape nothing.
- Derive types from Zod schemas; keep one source of truth for shapes.
- Write handlers as: validate → authorize → scope → operate → return scoped result.
- Use optimistic UI on submit, reconciled against the server confirmation.

**Do not:**
- Put Prisma, auth logic, or domain rules in `frontend/standup-tracker`.
- Query team data without tenant scope.
- Use server/global time for "today," or manual timezone math.
- Add a timezone picker, Redis, WebSockets, a queue broker, or a second datastore without explicit sign-off.
- Call Gemini synchronously on the render path or on every load.
- Expose tokens to the browser or log secrets/PII.
- Bypass Zod with casts or unchecked parsing.

---

## 12. Environment & commands

Required env (names indicative): `DATABASE_URL` (Neon pooled), `DIRECT_URL` (Neon direct, migrations only), access/refresh token secrets, `GEMINI_API_KEY`, SMTP credentials, `WEB_APP_URL`, `API_BASE_URL`, allowed CORS origin.

- Run the app: start `backend` (Express, npm) and `frontend/standup-tracker` (Next.js, pnpm) separately — they are independent installs, not a shared workspace.
- **Migrations run against `DIRECT_URL`** — never the pooler.
- Use Neon **branches** for preview/staging; never test against production data.
- Frontend deploys to Vercel; backend to Render. Keep them independently deployable — no shared runtime state.

---

## 13. Definition of done (check before finishing a task)

- [ ] Input validated with a shared Zod schema at the boundary.
- [ ] Every team-data query scoped to the caller's `teamId`.
- [ ] Identity, team, and role re-checked on the request.
- [ ] Any day/date logic uses the user's IANA zone — no server time, no manual offsets.
- [ ] Standup writes are idempotent upserts on `(userId, localStandupDate)`.
- [ ] AI path (if touched) is cached, batched, untrusted-input-safe, and degrades gracefully.
- [ ] No tokens exposed to the client; no secrets in code or logs.
- [ ] Failure paths return clear, retryable errors and preserve user input.
- [ ] No unsanctioned infra added (Redis, WebSockets, queue, second store).
- [ ] Migrations (if any) target `DIRECT_URL`.
