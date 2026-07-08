# Auth — Phased Implementation Plan (Identity & Access)

Production-ready, backend-only implementation plan for the **Identity & Access** module and the shared **auth foundation** of Standup Tracker. Scoped strictly to what `CLAUDE.md`, `standup-tracker-architecture.md`, and `standup-tracker-workflow.md` define — no external standards, no speculative features, no UI.

**Sources of truth (in precedence order):** architecture doc → `CLAUDE.md` → workflow doc → the existing scaffold. Where this plan and the architecture disagree, the architecture wins.

---

## 0. Baseline — what already exists

Verified in the repo; the plan builds on this, it does not re-scaffold it.

- `backend/` is a plain-npm Express 5 + TypeScript app. Deps already installed: `argon2`, `jsonwebtoken`, `luxon`, `zod`, `@prisma/client` + `@prisma/adapter-pg` (Prisma 7), `nodemailer`, `express-rate-limit`, `cors`, `morgan`, `dotenv`, `tsx`.
- [backend/src/index.ts](backend/src/index.ts) — bare app: CORS locked to `CORS_ORIGIN`, `morgan`, `express.json()`, `/health`, graceful shutdown. No routes, no auth.
- [backend/src/db/prisma.ts](backend/src/db/prisma.ts) — base Prisma client on the **pooled** `DATABASE_URL` via the pg adapter. Comment already mandates that team data go through the tenant-scoping layer.
- [backend/prisma/schema.prisma](backend/prisma/schema.prisma) — datasource + generator only. **No models defined.**
- [backend/prisma.config.ts](backend/prisma.config.ts) — migrations pinned to **`DIRECT_URL`** (unpooled). Correct per architecture §4/§5.
- No `src/` domain modules, no middleware, no Zod schemas yet.

**This means Auth is greenfield on top of a correct connection/config skeleton.** The three phases below are additive.

---

## 1. Scope & module boundaries

### In scope (this plan)
The **Identity & Access** module responsibilities (architecture §2, §6; workflow "Starting a new team, and getting members in") plus the cross-cutting auth foundation:

- Password hashing (Argon2id), session issuing / refresh-token rotation / revocation, per-request re-authorization (identity + team + role), member-invitation token lifecycle, password-reset token lifecycle, signup (which provisions the team + owner-admin).
- Shared foundation: the **tenant-scoping data-access** seam, the **authenticate** middleware, the **role guard**, IANA-timezone validation, auth rate limiting, structured errors, and Zod boundary validation.

### Out of scope (owned by other modules — consumed via a service seam only)
Kept out deliberately to respect domain boundaries (`CLAUDE.md` §3) and avoid scope creep:

- **Roster CRUD & role changes** (add/remove member, member→lead) — **Teams & Membership** module. Auth exposes `issueInviteToken(userId)` for the Teams "add member" flow to call; the roster endpoints themselves are not built here.
- **Email delivery** (queued, retried, off the request path) — **Notifications & Scheduling** module. Auth *produces* the raw invite/reset token and hands it to a notifications dispatch seam; it does **not** build the SMTP worker or scheduler (`CLAUDE.md` §9).
- Standups, Dashboard, AI Insights, History — untouched.
- All UI, BFF route handlers, cookies, CSRF, middleware routing on the Next.js side — **not** in this plan (backend-only). Express issues bearer tokens in the response body to the trusted server-side BFF and never sets a browser cookie (`CLAUDE.md` §6, architecture §1/§6).

---

## 2. Design decisions locked for Auth

Each traceable to the docs; recorded here so implementation has no ambiguity.

1. **Express is the only place auth logic lives.** BFF stays thin (Golden Rule 1). Express returns `{ accessToken, refreshToken }` in the JSON body to the server-side BFF; the BFF is what stores them in its `httpOnly` cookie. Express sets no cookies and never exposes a token to client JS (Golden Rule 6).
2. **Access token = short-lived JWT** (`jsonwebtoken`, HS256, `ACCESS_TOKEN_SECRET`), claim `sub = userId` only. **Team and role are re-resolved from the DB on every request**, never trusted from the token — this is what makes removal/role-change take effect immediately (Golden Rule 5, architecture §4/§6).
3. **Refresh token = opaque random secret**, stored only as an HMAC-SHA256 hash (`REFRESH_TOKEN_SECRET`). Rotated on every refresh; the old session is revoked; presenting an already-rotated token is treated as reuse and revokes the session chain. Revocation supported (architecture §6).
4. **Invite and reset tokens = opaque random secrets, single-use, expiring, stored only hashed** (HMAC-SHA256). The raw token leaves the process exactly once, to the notifications dispatch seam. A DB read never reveals a usable link (`CLAUDE.md` §5, architecture §6/§14).
5. **Auth's own lookups (login-by-email, refresh-by-token, token verification) run outside tenant scope — because they are what *establishes* the tenant.** Every *other* (team-owned) query goes through the tenant-scoping wrapper. This is the one sanctioned pre-tenant path; it is not a Golden-Rule-2 exception for team data.
6. **Email is globally unique** on `User`. Login is email + password with no team selection (workflow "Signing in… is the same for everybody"), so email must resolve a single user.
7. **Role** is a Postgres enum `OWNER_ADMIN | LEAD | MEMBER` (maps to the doc's `owner-admin / lead / member`; hyphens aren't legal enum identifiers).
8. **Timezone is captured, never configured.** `User.timezoneIana` is written from the validated `timezone` field on **signup and every login** (architecture §3/§8). No timezone picker (`CLAUDE.md` §6).
9. **Zod schemas are the single shape**, defined in the identity module. The shared-package gap (`CLAUDE.md` §3/§7) is **flagged, not worked around** — see §7.

---

## 3. Target file layout (auth additions only)

Cohesive module folders under `backend/src/`, matching the module names in `CLAUDE.md` §3. Nothing speculative — every file has a job in one of the three phases.

```
backend/src/
  index.ts                      # (exists) extend: mount auth router, rate limiter, error handler
  db/prisma.ts                  # (exists) unchanged
  config/env.ts                 # P1  load + Zod-validate required env at boot; fail fast
  shared/
    httpError.ts                # P1  typed AppError + Express error handler (structured, retryable)
    validate.ts                 # P1  parse(req.body/query/params, schema) → 400 before any logic
    ianaZones.ts                # P1  allow-list of supported IANA zones (validated set)
  data-access/
    tenantScope.ts              # P1  the sanctioned team-scoped accessor seam (foundation)
  auth/
    passwords.ts                # P1  argon2id hash / verify
    tokens.ts                   # P1  access JWT sign/verify; opaque token gen; HMAC hash/compare
    session.ts                  # P1  issue / rotate / revoke refresh sessions (over Session model)
    authenticate.ts             # P1  middleware: verify bearer → load user → attach req.auth
    authorize.ts                # P1  requireRole(...roles) guard
    rateLimit.ts                # P1  express-rate-limit config for auth endpoints
  identity/
    identity.schemas.ts         # P2/P3 Zod schemas + inferred types (source of truth for shapes)
    identity.service.ts         # P2/P3 signup, login, refresh, logout, accept-invite, reset, issueInviteToken
    identity.routes.ts          # P2/P3 /auth/* REST surface
  teams/
    teams.service.ts            # P2  provisionTeam(...) — called by signup (Teams module seam)
  notifications/
    notifications.seam.ts       # P3  enqueueEmail(...) interface only; real worker is Notifications module
```

**Data-model additions** (Prisma, one migration in Phase 1) — conceptual per architecture §5:

- `Team` — `id`, `name`, `createdAt`.
- `User` — `id`, `teamId`(FK, indexed), `email`(unique), `name`, `role`(enum), `passwordHash`(nullable until invite accepted), `timezoneIana`(nullable until first login), `status`(`PENDING | ACTIVE | REMOVED`), `createdAt`, `updatedAt`.
- `Session` — `id`, `userId`(indexed), `tokenHash`(unique), `expiresAt`, `revokedAt?`, `createdAt`. Rotating refresh store.
- `AuthToken` — `id`, `userId`(indexed), `purpose`(enum `INVITE | PASSWORD_RESET`), `tokenHash`(unique), `expiresAt`, `consumedAt?`, `createdAt`. One table serves both single-use flows (minimal, not two near-identical tables).

**Env additions** (names per `CLAUDE.md` §12; secrets stay in env, Golden Rule 10): `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `WEB_APP_URL` (for links handed to notifications), plus existing `DATABASE_URL`, `DIRECT_URL`, `CORS_ORIGIN`. TTLs live as named constants in code (access ~15m, refresh ~30d, invite ~72h, reset ~1h) — reasonable production defaults, not configuration surface.

---

## Phase 1 — Auth foundation & data model

**Single objective:** everything auth stands on — schema, primitives, middleware, scoping seam — with **no endpoints**. Nothing user-facing ships; this is the substrate Phases 2–3 assemble.

### Deliverables
1. **Prisma models + migration.** Add `Team`, `User`, `Session`, `AuthToken` and the `Role`/`UserStatus`/`TokenPurpose` enums to [schema.prisma](backend/prisma/schema.prisma). Generate the client. **Run the migration against `DIRECT_URL`** (already wired in `prisma.config.ts`) — never the pooler. Every tenant-owned row (`User`) carries `teamId` (`CLAUDE.md` §4).
2. **`config/env.ts`** — parse required env with Zod at boot; crash fast with a clear message if a secret/URL is missing. No secret is ever logged.
3. **`shared/httpError.ts`, `shared/validate.ts`** — a typed `AppError` (status + code + safe message), a terminal Express error handler that returns structured, retryable errors and never leaks internals, and a `validate` helper that parses `body`/`query`/`params` through a Zod schema **at the very top of a handler** and rejects before logic runs (Golden Rule 4).
4. **`shared/ianaZones.ts`** — the allow-list of accepted IANA zone strings (covering at minimum `Asia/Karachi`, `Europe/Berlin`, `America/Los_Angeles`; validated set, never freeform — architecture §7, `CLAUDE.md` §6/§7). Validation uses Luxon to confirm the zone is real.
5. **`auth/passwords.ts`** — `hash(password)` / `verify(hash, password)` using **Argon2id**. Never store, log, or return anything reversible (`CLAUDE.md` §5).
6. **`auth/tokens.ts`** — sign/verify the access JWT (`sub` only); generate high-entropy opaque tokens; `hashToken` / `safeCompare` via HMAC-SHA256 with the server secret for refresh + single-use tokens.
7. **`auth/session.ts`** — `issueSession(userId)`, `rotateSession(rawRefresh)`, `revokeSession(...)` over the `Session` model, with rotation + reuse detection (decision §2.3).
8. **`auth/authenticate.ts`** — middleware: read `Authorization: Bearer`, verify the access token, **load the user from the DB**, reject if `status !== ACTIVE`, and attach `req.auth = { userId, teamId, role }`. This is the per-request re-authorization point (Golden Rule 5).
9. **`auth/authorize.ts`** — `requireRole(...roles)` guard returning 403 for out-of-role access; a member must never receive lead/admin data (`CLAUDE.md` §5).
10. **`auth/rateLimit.ts`** — an `express-rate-limit` limiter for auth endpoints (architecture §14).
11. **`data-access/tenantScope.ts`** — the sanctioned seam that binds a query to `req.auth.teamId` (inject `where: { teamId }` / assert on read). Built minimal — Auth barely queries team data; it exists so downstream modules have exactly one path (`CLAUDE.md` §4). Document that auth's own pre-tenant lookups (decision §2.5) intentionally bypass it.
12. **Wire `index.ts`** — register the error handler and (empty for now) auth router mount point.

### Rules honored
Golden Rules 1, 2, 4, 5, 6, 10 · architecture §4, §5, §6, §14 · migrations target `DIRECT_URL`.

### Verification / DoD
- `npm run typecheck` clean; `prisma migrate` applies to a **Neon branch** (never production — `CLAUDE.md` §12).
- Manual: hashing round-trips; access token verifies; `authenticate` rejects missing/expired/invalid bearer and non-`ACTIVE` users; `requireRole` blocks the wrong role; env loader fails fast on a missing secret.
- No secret appears in any log; no token in any response yet.

---

## Phase 2 — Session lifecycle (start a team, sign in, stay in)

**Single objective:** a user can create a team as owner-admin, sign in, hold and rotate a session, and sign out. Delivers the workflow's "start a new team" + "sign in" doors end to end.

### Deliverables
1. **`teams/teams.service.ts`** — `provisionTeam({ name })` creating the `Team` row. Kept in the Teams module so signup calls *its* service rather than reaching into team data directly (`CLAUDE.md` §3 cross-module rule).
2. **`identity.schemas.ts`** — Zod schemas: `signup` (`name`, `email`, `password`, `teamName`, `timezone`), `login` (`email`, `password`, `timezone`), `refresh` (`refreshToken`), `logout` (`refreshToken`). `timezone` validated against `ianaZones`. Export inferred types (single source of shape).
3. **`identity.service.ts`** —
   - `signup(...)` — one **transaction**: `provisionTeam` → create the owner `User` (`role = OWNER_ADMIN`, `status = ACTIVE`, `timezoneIana` from payload, `passwordHash` from Argon2id) → `issueSession`. Returns `{ accessToken, refreshToken, user }`. This is the sole owner-creation + tenant-provisioning path (workflow "The owner starts the team").
   - `login(...)` — resolve user by email, `verify` password, reject non-`ACTIVE`; **update `timezoneIana`** from the payload; `issueSession`. Generic failure message (no user enumeration / no "wrong password vs no account" distinction).
   - `refresh(...)` — `rotateSession` → new access + refresh; reuse revokes the chain.
   - `logout(...)` — `revokeSession`.
4. **`identity.routes.ts`** — `POST /auth/signup`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, and `GET /auth/me` (authenticated; returns `{ userId, teamId, role, name, email }` so the BFF can role-route without a token — architecture §3). Each route: **validate → (authenticate where required) → operate → return**. Rate limiter applied to `signup`/`login`/`refresh`.
5. **Mount** the router in `index.ts` behind the auth rate limiter.

### Endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/signup` | none | Create team + owner-admin; issue session |
| POST | `/auth/login` | none | Verify credentials; refresh timezone; issue session |
| POST | `/auth/refresh` | none (refresh token) | Rotate session; issue new access token |
| POST | `/auth/logout` | none (refresh token) | Revoke session |
| GET | `/auth/me` | bearer | Resolve identity/team/role for the BFF |

### Rules honored
Golden Rules 1, 4, 5, 6, 10 · architecture §6/§7/§8 (timezone capture on login) · signup transactional & tenant-provisioning · no user enumeration · tokens returned to the BFF in-body, never as a browser cookie.

### Verification / DoD
- Signup creates exactly one team + one `OWNER_ADMIN`, both scoped, with a valid session; rollback on any failure (never a half-provisioned team).
- Login updates `timezoneIana`; wrong password and unknown email return the same generic error.
- Refresh rotates and revokes the prior token; replaying an old refresh token revokes the chain.
- `/auth/me` reflects DB role/team live (change role in DB → next call reflects it).
- Structured, retryable errors on failure; input echoed only as validation detail, never secrets.

---

## Phase 3 — Onboarding & recovery tokens (invite accept, password reset)

**Single objective:** an invited member can set their password and become active, and any user can recover a forgotten password — all via single-use, hashed, expiring tokens. Completes the account lifecycle without touching roster CRUD or the email worker.

### Deliverables
1. **`notifications/notifications.seam.ts`** — `enqueueEmail(kind, to, payload)` **interface only**, with a dev-safe stub. The queued/retried SMTP worker is Notifications-module work (`CLAUDE.md` §9) and is explicitly **not** built here. Auth builds the link from `WEB_APP_URL` + raw token and hands it over exactly once.
2. **`identity.service.ts` additions —**
   - `issueInviteToken(userId)` — create an `AuthToken` (`purpose = INVITE`, hashed, expiring), return the raw token to the caller and `enqueueEmail`. **Called by the Teams "add member" flow** (that endpoint lives in Teams & Membership, out of scope) — this is the seam Auth exposes.
   - `acceptInvite({ token, password })` — verify unconsumed/unexpired token → **transaction**: set `passwordHash`, set `status = ACTIVE`, set `consumedAt`. Activates the account (workflow "The admin creates everyone else").
   - `requestPasswordReset({ email })` — always respond 200 (no enumeration); if the user exists, issue an `AuthToken` (`purpose = PASSWORD_RESET`) and `enqueueEmail`.
   - `resetPassword({ token, password })` — verify token → **transaction**: set new `passwordHash`, `consumedAt`, and **revoke all of the user's sessions** (`CLAUDE.md` §5, architecture §6 — reset invalidates existing sessions).
3. **`identity.schemas.ts` additions** — `acceptInvite`, `forgotPassword`, `resetPassword` schemas (password strength rule identical to signup; single source).
4. **`identity.routes.ts` additions** — `POST /auth/invitations/accept`, `POST /auth/password/forgot`, `POST /auth/password/reset`, all rate-limited, all `validate → operate → return`.

### Endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/invitations/accept` | none (invite token) | Set password, activate account, consume token |
| POST | `/auth/password/forgot` | none | Issue reset token if user exists; always 200 |
| POST | `/auth/password/reset` | none (reset token) | Set new password, consume token, revoke sessions |

*(Service seam, no HTTP surface here: `issueInviteToken` — consumed by the Teams roster endpoint.)*

### Rules honored
Golden Rules 4, 5, 6, 9, 10 · architecture §6/§14 (single-use, hashed, expiring tokens) · `CLAUDE.md` §9 (email off the request path, delegated) · no user enumeration · reset revokes sessions.

### Verification / DoD
- Invite/reset tokens are stored only hashed; a raw token verifies once and a second use is rejected; expired tokens are rejected.
- `acceptInvite` flips `PENDING → ACTIVE` and sets the password atomically; failure leaves the user `PENDING`.
- `forgot` returns identical responses for existing and unknown emails.
- `resetPassword` invalidates all prior sessions (old refresh tokens stop working).
- `enqueueEmail` receives the link; no token or PII is logged.

---

## 4. Cross-cutting invariants (apply to every phase)

Mapped to the `CLAUDE.md` §13 Definition of Done:

- [ ] Every boundary validated with a Zod schema **before** any logic (Golden Rule 4).
- [ ] Identity + team + role re-checked on every authenticated request, from the DB (Golden Rule 5).
- [ ] Team-owned queries go through the tenant-scoping seam; auth's pre-tenant lookups are the one documented exception (Golden Rule 2, decision §2.5).
- [ ] Passwords Argon2id; invite/reset/refresh tokens hashed at rest; single-use tokens single-use + expiring (`CLAUDE.md` §5).
- [ ] No token ever reaches the browser or client JS; Express sets no cookies (Golden Rule 6).
- [ ] No secrets/PII in code or logs; secrets only in env (Golden Rule 10).
- [ ] Failure paths return structured, retryable errors; no swallowed errors (`CLAUDE.md` §10).
- [ ] Signup/accept/reset are wrapped in transactions; no half-written state.
- [ ] No unsanctioned infra (no Redis, queue broker, WebSockets, second store) — email delegated to the Notifications seam, not built (`CLAUDE.md` §9/§11).
- [ ] Migrations target `DIRECT_URL`; tested on a Neon branch, never production (`CLAUDE.md` §12).

---

## 5. Flagged gaps & seams (do not silently work around)

Per `CLAUDE.md` §3, these are surfaced rather than hacked past:

1. **Shared Zod schema (`CLAUDE.md` §3/§7).** No `packages/shared` exists, and `backend` + `frontend/standup-tracker` are not one workspace. Auth schemas therefore live in `identity/identity.schemas.ts` as the **single backend source**. When the BFF is built, it must consume these same schemas via real workspace tooling or a shared package — **do not hand-copy** them into the frontend. This plan does not create the shared package; it records the debt.
2. **Notifications worker.** Auth stops at `enqueueEmail`. The queued, backoff-retried, off-request-path SMTP delivery is Notifications-module work and is not implemented here.
3. **Teams roster module.** The "admin adds a member" / role-change / remove endpoints belong to Teams & Membership. Auth provides `issueInviteToken` and `provisionTeam` seams; the roster HTTP surface is out of scope.
4. **CSRF / cookie handling** lives on the Next.js BFF origin (cookie holder); Express is stateless bearer-token and has no cookie surface to defend. Out of scope for this backend plan.
