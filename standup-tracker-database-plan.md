# Standup Tracker — Database Design Implementation Plan

A phased, production-ready plan for the **database layer only**, derived strictly from `CLAUDE.md`, `standup-tracker-architecture.md`, and `standup-tracker-workflow.md`. Nothing here introduces a store, entity, field, or capability those documents do not call for. The plan is intentionally lean: two phases, each with a single objective, together producing the complete persistent foundation the product needs.

This document describes the model in prose and lists — no formatted tables, no SQL, no Prisma snippets. Field and entity names are written plainly; the actual schema is authored in the migration work of each phase.

---

## Scope and non-goals

**In scope:** the single Postgres store (Neon + Prisma) that is the system of record — its entities, relationships, keys, uniqueness rules, indexes, tenant-scoping foundation, and connection/migration strategy.

**Explicitly out of scope**, because the source documents place them outside the baseline data model:

- No second datastore, Redis, message broker, or blob storage. Neon Postgres is the only persistent store (architecture §5, §10, §17; CLAUDE §9).
- No dedicated notification/reminder state and no email-outbox entity. Reminders and lead alerts are **computed live** from standup presence and blocker text (architecture §8, §12); email delivery is an in-process, off-request-path concern of the notifications module, not persisted schema.
- No timezone-configuration entity. The IANA zone is captured automatically and stored on the user and on each standup — never configured (CLAUDE §6; architecture §8).
- No Postgres row-level security as a primary guard. Tenant isolation is enforced at the application data-access layer; RLS is noted only as optional defense-in-depth (CLAUDE §4; architecture §5, §14).

---

## Invariants the schema must uphold

These come directly from the contract and govern every design decision below:

- **Every tenant-owned row carries its team's identifier**, and every team-data query is scoped by the caller's teamId at the data-access layer (CLAUDE §2.2, §4; architecture §5).
- **A standup's day belongs to the writer.** Each standup stores the exact UTC submission instant, the writer's IANA zone name (never a fixed offset), and the derived local standup date. The local standup date is the key everything hinges on (CLAUDE §3, §6; architecture §8).
- **One update per person per local day**, enforced on the pair of user and local standup date, which also makes the submit an idempotent upsert (CLAUDE §2.8, §6; architecture §7, §8).
- **Onboarding tokens are single-use, expiring, and stored only as hashes** — a database read never reveals a usable link (CLAUDE §5; architecture §6).
- **Runtime uses Neon's pooled endpoint; migrations use the direct/unpooled endpoint.** Never migrate against the pooler (CLAUDE §4, §12; architecture §5).
- **The read path is indexed and tenant-scoped.** Latest-update-per-person must be an indexed per-user latest-row lookup, never fetch-all-then-filter (CLAUDE §4; architecture §13).
- **AI is never on the critical path.** The board must render every real update with the AI cache empty or unavailable (CLAUDE §2.7; architecture §11).

That last invariant is why the phasing splits where it does: **Phase 1 is a fully functional database with the AI layer entirely absent; Phase 2 adds only the cached-summary enhancement.**

---

## The conceptual data model

The documents enumerate a small, fixed set of entities (architecture §5). This plan implements exactly those, adding only what an explicitly stated requirement cannot be met without:

- **Team** — the tenant boundary.
- **User** — belongs to exactly one team, carries a role and a last-known IANA timezone.
- **Standup** — tied to a user, stamped with the UTC instant, the writer's timezone, and the derived local standup date.
- **Onboarding token** — single-use, hashed, expiring; covers both invitations and password resets.
- **Session refresh token** — hashed, per user; the minimal persistence required to satisfy the rotating-refresh-token **rotation and revocation** requirement (CLAUDE §5; architecture §6). Access tokens remain stateless and are never stored; this entity exists solely so a refresh token can be rotated and revoked.
- **AI summary** — cached per team and standup date with a fingerprint of the source updates. Delivered in Phase 2.

Everything except the AI summary is delivered in Phase 1.

---

## Phase 1 — Core system of record: tenancy, identity, and standups

**Single objective:** stand up the complete transactional foundation so the product is fully functional end to end — team creation, roster and roles, invitations and resets, login with rotating/revocable sessions, the timezone-correct daily standup, editing, and the whole tenant-scoped read path — with no AI in the picture.

### Foundation and tooling

- Establish Prisma in the backend app (plain npm, per CLAUDE §3), with the schema and migrations living in the backend only. There is no shared workspace and no shared package; do not assume one.
- Wire the two Neon endpoints: the **pooled** connection string for the long-lived runtime Prisma pool, and the **direct/unpooled** connection string used only by migrations. Both come from environment secrets — never committed (CLAUDE §4, §10, §12).
- Author the tenant-scoping data-access wrapper as the single choke point through which all team-owned reads and writes pass, injecting the caller's teamId into every query. No handler touches Prisma for team data directly (CLAUDE §2.2, §4; architecture §5).
- Use Neon branching for preview and staging databases; never run migrations or tests against production data (CLAUDE §12; architecture §5).

### Team

- Identity, a display name, and creation timestamp. The team is the tenant root; it is created atomically with its owner during signup (workflow "Starting a new team"; architecture §18).
- Teams are not deleted in this product; the owner-admin persists for the life of the team.

### User

- Belongs to exactly one team by a required team reference; the team identifier is present on the row so the user is itself tenant-scoped.
- Carries: a name; an email that is globally unique because sign-in is by email and password for everyone (workflow "Signing in"); a password hash produced by a memory-hard algorithm (Argon2id or bcrypt), nullable until an invited member accepts and sets it; a role that is one of owner-admin, lead, or member; a last-known IANA timezone captured from the browser, nullable until the first login refresh writes it; and an active/deactivated state.
- **Removal is a soft deactivation, not a delete.** When an admin removes someone, they can no longer sign in, but their past updates remain in the team's history (workflow "Remove people," "Looking back"). Therefore the schema never cascades a user deletion into their standups.
- Never store or return anything password-derived that is reversible (CLAUDE §5).

### Standup

- Belongs to a user and carries the team identifier on the row for tenant scoping and for the team-and-date dashboard queries (CLAUDE §4; architecture §13).
- Stores the three answers: yesterday, today, and blockers — with blockers permitted to be empty; the fully-blank case (all three empty) is rejected at the validation boundary, not in the database (CLAUDE §7; workflow "Writing today's update").
- Stores the three time facts that make "today" belong to the writer: the exact UTC submission instant, the writer's IANA zone name, and the derived local standup date.
- Carries an edited marker with its timestamp so a lead who read an early version can tell the text changed and trust the latest (CLAUDE §6; architecture §8; workflow "Changing your mind").
- **Uniqueness:** exactly one standup per user per local standup date. This constraint is what makes the submit an idempotent upsert — a retried request after a flaky connection reconciles against the existing row instead of duplicating (CLAUDE §2.8, §6; architecture §7, §16). Editability (only while the writer's current local date still equals the stored local standup date) is enforced in Express; the database simply records the latest text and the edited timestamp.

### Onboarding token

- One entity covering both invitations and password resets, distinguished by a type value, per the documents' grouping of them as one family of short-lived, single-use, hashed tokens (architecture §5, §6).
- Stores only a hash of the token, its type, the user and team it belongs to, an expiry, and a single-use consumption marker so a spent or expired token can never be reused (CLAUDE §5; architecture §6).

### Session refresh token

- Stores only a hash of the refresh token, the owning user and team, an expiry, and rotation/revocation markers so refresh can rotate the token and issued sessions can be revoked. This is the minimal state required by the rotating-refresh-token and revocation requirements; access tokens remain stateless and are not persisted (CLAUDE §5; architecture §6).

### Indexes and read-path shape

All read patterns the product needs are served by Phase 1 indexes so the dashboard and history stay cheap as teams grow (architecture §13, §15):

- The unique pairing of user and local standup date, which doubles as the one-per-day guard and the upsert key.
- A per-user latest-row lookup, keyed by user and submission instant, so "latest update per person" is an indexed lookup rather than a scan-and-filter (CLAUDE §4; architecture §13).
- A team-and-local-standup-date lookup so the date picker can align each person to their own version of a chosen day within one team, and so the live board can gather a team's day efficiently (architecture §8, §13).
- A per-user, descending-by-local-date ordering to serve paginated personal history (architecture §15, workflow "Looking back").
- Supporting lookups for active roster by team, and for tokens by their hash and expiry.

### Relational integrity

- Users reference their team; standups reference both their user and their team; tokens and refresh tokens reference their user and team. Referential integrity is enforced by the database.
- Because user removal is a soft deactivation, standups are never deleted with a user, preserving history. Expired or consumed tokens may be pruned by routine cleanup without affecting any domain record.

### Phase 1 done criteria

- Every tenant-owned entity carries its teamId and is reachable only through the tenant-scoping wrapper.
- The standup upsert is idempotent on user and local standup date, storing the UTC instant, IANA zone, and derived local date.
- Roles, timezone, and active state live on the user; passwords are stored only as memory-hard hashes.
- Onboarding and refresh tokens are stored only as hashes, single-use/rotating and expiring.
- Every read the product performs — home history, live board latest-per-person, date-picker per-day alignment, "no update yet" derivation — is backed by an index and scoped to one team.
- Migrations run against the direct endpoint; the runtime pool binds the pooled endpoint; no connection strings or secrets are in code or logs.
- The database is fully functional with no AI entity present.

---

## Phase 2 — Cached AI summaries

**Single objective:** add the one remaining entity from the conceptual model — the cached team-day summary — as a strictly additive enhancement that the Phase 1 board never depends on.

### AI summary

- Cached per team and standup date, carrying the generated summary text, a fingerprint of the underlying updates it was built from, and its generation timestamp (architecture §5, §11; CLAUDE §8).
- **Uniqueness:** one cached summary per team and standup date, so a lookup by that pair either hits a valid cache or misses.
- **Invalidation by fingerprint:** the summary is served from cache until the fingerprint of the team's current updates for that date no longer matches, or a lead explicitly requests a refresh. Gemini is never called on every dashboard load (CLAUDE §8; architecture §10, §11).
- **Graceful degradation is a schema-supported property, not an afterthought:** because this entity is separate from and additive to the Phase 1 model, an empty or stale cache, or an unavailable Gemini, changes nothing about the board — every real update still renders, with only a "summary unavailable right now" note in place of the summary (CLAUDE §2.7; architecture §11, §16).
- Belongs to a team and carries the team identifier, so it is tenant-scoped like every other row and read only through the scoping wrapper.

### Indexes

- The unique pairing of team and standup date is the sole access path and its own index; no additional read-path indexing is required, since the summary is fetched by exact key alongside a board that is already served by Phase 1's indexes.

### Phase 2 done criteria

- Exactly one cached summary per team and standup date, with a stored fingerprint driving regeneration only on change or explicit refresh.
- The cached summary is tenant-scoped and read through the same wrapper as all team data.
- Removing or emptying this entity leaves the Phase 1 board fully working — proof the AI layer is off the critical path.
- No new store, cache tier, or broker is introduced; the summary lives in Postgres exactly as the documents specify.

---

## Why two phases, and why this split

The cap of two phases maps cleanly onto the product's own architecture. Phase 1 is everything required for the tool to work — a team's private space, its roster and roles, sessions, and the timezone-correct daily standup with its full tenant-scoped read path. Phase 2 adds the single piece the architecture treats as an enhancement that may fail: the cached AI summary. Splitting here honors the invariant that AI is never on the critical path, keeps each phase to one clear objective, and avoids any intermediate state that is non-functional. Nothing is deferred that the core needs, and nothing speculative is added to either phase.
