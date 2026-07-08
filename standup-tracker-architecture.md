# Standup Tracker — System Design & Architecture

A multi-tenant SaaS where each team gets a private space, members post a three-question daily standup against **their own local day**, and leads see the whole team on one screen with a Gemini-written summary at the top. This document covers the architecture, module responsibilities, and the system-design decisions behind it. No code or schemas — decisions and workflows only.

**Stack:** Next.js (Vercel) frontend · Express.js (Render) backend · Neon PostgreSQL + Prisma · Zod for validation · SMTP for email · Gemini for AI · TLS everywhere.

---

## 1. Overall Architecture

The system is a **two-tier application with a clean split of responsibilities**. Next.js is the presentation and edge layer; Express is the single source of truth for domain logic and data. They are deliberately not peers sharing business rules — all authorization, tenant isolation, timezone resolution, AI orchestration, and persistence live in one place (Express), so there is exactly one place to reason about correctness and security.

```
Browser
  │  (httpOnly session cookie, same-origin)
  ▼
Next.js on Vercel  ──────────►  CDN / edge cache (static + ISR reads)
  │  BFF route handlers                       
  │  (attach bearer token, forward server-side)
  ▼
Express API on Render  ──────►  Gemini (AI summaries)
  │                    ──────►  SMTP (invites, resets, reminders, alerts)
  │  Prisma
  ▼
Neon PostgreSQL (pooled) — system of record + cached AI summaries
```

**Request path.** The browser only ever talks to the Next.js origin and holds a single `httpOnly`, `Secure`, `SameSite` session cookie. Next.js **BFF route handlers** unpack that cookie server-side, attach a short-lived bearer token, and forward the call to Express. The browser never sees a cross-origin API token, which sidesteps third-party-cookie problems between the Vercel and Render domains and keeps credentials off the client entirely.

**Why this split.** Vercel gives fast, cache-friendly rendering at the edge; Render gives a long-lived, stateful-friendly Node process ideal for scheduled jobs, streaming AI responses, and holding a warm database pool. Splitting them lets each scale on its own axis (read traffic vs. compute) without one becoming the other's bottleneck.

---

## 2. Core Modules

The backend is organized as domain modules with a shared data-access and auth foundation. Each is independently testable and owns its own rules.

- **Identity & Access** — signup (creates team + owner), login, session issuing/refresh, password hashing, member invitations, password reset. Owns all token lifecycles.
- **Teams & Membership** — tenant provisioning on signup, roster management (add/remove members), and role assignment (owner-admin / lead / member).
- **Standups** — submit and edit the three-question update, the one-update-per-local-day rule, non-empty validation, and resolution of the writer's local standup day.
- **Dashboard / Read Models** — the lead's team board: latest-per-person, "no update yet" markers, blocker surfacing, and date-picker queries aligned to each person's own day.
- **AI Insights** — orchestrates Gemini: builds a grounded prompt from real standups, generates the day summary, caches it, and degrades gracefully when unavailable.
- **Notifications & Scheduling** — timezone-aware member reminders and lead alerts (new/persistent blockers), plus the scheduler that drives them.
- **History** — per-member and per-team backward browsing of any past day, aligned to each writer's real day.

A cross-cutting **tenant-scoping layer** sits under all data access so no module can accidentally read across teams.

---

## 3. Frontend (Next.js on Vercel)

Built on the **App Router** with a mix of server and client components. Server components fetch and render the read-heavy screens (home, dashboard, history) so first paint is fast and data-scoped work stays off the client. Client components handle the interactive bits: the standup form, inline edit, and the date picker.

- **Session-aware routing.** Middleware validates the session cookie at the edge and routes by role before a protected page renders. A member never receives markup for lead/admin areas — the page isn't rendered for them, not merely hidden with CSS.
- **Optimistic submit.** Posting a standup updates the UI immediately and reconciles against the server confirmation, so the user never stares at a spinner but also never sees a false success if the write fails.
- **Streaming + skeletons.** The dashboard streams the board first and slots the AI summary in when it arrives, so a slow AI moment never blocks the real updates.
- **Automatic timezone capture.** The client reads the browser's IANA timezone (via the Intl API) and includes it on login and on each submit. The user is never asked — this is the only "configuration" and it happens silently.

The BFF route handlers in Next.js are thin: authenticate the cookie, forward to Express, shape nothing. All logic stays server-side.

---

## 4. Backend (Express.js on Render)

A **stateless HTTP API** — every request carries its own identity, so any instance can serve any request and the service scales horizontally behind Render's load balancer with no session affinity.

Request lifecycle for every call: verify the bearer token → resolve the caller's user, team, and role → validate the input (schema-checked) → run the domain operation inside the tenant scope → return a scoped response. Authorization is re-checked **on every request** (team membership + role + resource ownership), never trusted from a prior login.

A **single scheduler** (a Render Cron job or a leader-elected worker guarded by a Postgres advisory lock) drives reminders and alert evaluation, so horizontal scaling of the web tier never causes duplicate emails.

---

## 5. Database & Storage (Neon + Prisma)

Neon Postgres is the **only persistent store** — there are no file uploads in this product, so no blob storage is needed. Generated AI summaries are persisted in Postgres too (see §11), so nothing else is required.

**Conceptual data model (responsibilities, not tables).** The system tracks: teams (the tenant boundary); users belonging to exactly one team, each carrying a role and their last-known IANA timezone; standups, each tied to a user and stamped with the exact UTC submission instant, the writer's timezone, and the derived **local standup date**; cached AI summaries keyed by team and standup date with a fingerprint of the underlying updates; and short-lived, single-use, hashed tokens for invites and password resets. Every tenant-owned row carries its team's identifier.

**Tenant isolation.** Enforced at the data-access layer: a scoping wrapper injects the caller's team into every query, so no module can read another team's rows even by mistake. Postgres row-level security is available as optional defense-in-depth for teams that want a hard database-level guarantee.

**Connection strategy.** Because Express is a long-lived process, it holds a warm Prisma pool against **Neon's pooled endpoint** to cap total connections under load. Schema migrations run against the **direct (unpooled) endpoint**, since pooled connections don't support them. Neon branching gives disposable, isolated databases for preview and staging environments.

---

## 6. Authentication & Authorization

- **Passwords** are hashed with a memory-hard algorithm (Argon2id or bcrypt) and are never stored or logged in any recoverable form.
- **Sessions** use a short-lived access token plus a rotating refresh token. Tokens live only in the `httpOnly`, `Secure`, `SameSite` cookie held by the Next.js origin; the browser's JavaScript never touches them.
- **Onboarding tokens** — invitations and password resets — are single-use, expiring, and stored only as hashes, so a database read never reveals a usable link.
- **Roles** gate capability: owner-admin (full control incl. roster and roles), lead (full team view + AI, no account admin), member (own updates only). The app resolves role server-side and both hides and blocks out-of-role areas.

The guiding rule: getting in once grants nothing by itself — every request independently proves who you are, which team you're on, and whether you may see what you asked for.

---

## 7. APIs & Server Actions

Express exposes a small, purpose-built **REST surface** grouped by module (auth, team/roster, standups, dashboard, insights, notifications). Next.js reaches it exclusively through server-side BFF handlers, so there are no public API tokens in the browser and CORS on Express is locked to the single Vercel origin.

Every endpoint validates its input with a **Zod schema at the boundary** — request bodies, query params, and route params are parsed and rejected before any domain logic runs, so malformed or malicious input never reaches the database or the AI layer. Zod schemas double as the single, versionable definition of what each endpoint accepts, and the same schemas validate the timezone-capture payload (a checked IANA zone string, never freeform) and the three-question standup form (rejecting only the fully-blank case, per the product rule). Endpoints return tenant-scoped data only. Write endpoints (submit, edit) are **idempotent** — a standup is an upsert on the writer + their local day — so a retried request after a flaky connection can never create a duplicate.

Next.js Server Actions are used only for local, non-domain UI concerns; anything touching data or authorization goes through Express, keeping a single source of truth.

---

## 8. Time Zones — the core correctness requirement

The team spans **Karachi, Berlin, and San Francisco**, and "today" must belong to the person, not to a server or a headquarters. At one instant it can be Tuesday in Karachi while it's still Monday in San Francisco — both are correct, and the app must record and display each accordingly, without ever asking anyone to set a timezone.

**How a person's day is determined.** Each user's IANA timezone (e.g. `Asia/Karachi`, `Europe/Berlin`, `America/Los_Angeles`) is captured automatically from the browser and refreshed on login and on each submission. On submit, the server stores three things: the exact **UTC instant**, the writer's **timezone**, and the **local standup date** derived by converting that instant into the writer's timezone and taking the calendar date. That local date is the key everything hinges on.

Storing an **IANA zone name rather than a fixed offset** is deliberate: the conversion library applies the correct offset for that date automatically, so Berlin's and San Francisco's daylight-saving shifts are handled with no special-casing, while Karachi (no DST) simply stays at its fixed offset.

**One update per person per day** is enforced on the pair (user, local standup date), so each person gets exactly one slot per their own calendar day.

**Editing** is allowed only while it is still the same local day for the writer: the server computes the user's current local date in their timezone and permits edits only while it matches the update's stored local date. Once their day rolls over, the update settles into history. Edited updates keep the latest text and carry an "edited" marker with a timestamp, so a lead who read an early version isn't misled.

**The lead's dashboard.** The default view is the **latest update from each person**, each card labeled with that writer's own day and local submission time — so a Tuesday card can sit next to a Monday card and nothing looks broken; the labels explain the difference. The **date picker** aligns everyone to *their* version of the chosen day: "show me Monday" pulls each person's update whose local standup date is that Monday, never a single rigid UTC window that would clip half the team. The lead does no timezone arithmetic; the app has already resolved it.

**"No update yet."** For the live board, the server computes each member's *current* local date and marks anyone with no update for that date. For a picked date, anyone without an update on their personal version of that date is marked. Absence is always a visible, intentional signal.

**Reminders** are evaluated against each user's local clock: the scheduler wakes frequently, and for each user checks whether it is near their local morning reminder time and they haven't yet posted for their current local day — so nobody is buzzed at 3 a.m.

---

## 9. Real-time Features

The interaction pattern is a morning trickle of updates, not a live chat, so heavy real-time infrastructure would be overengineering. The recommended approach:

- **Dashboard freshness** via **Server-Sent Events (SSE)** from Express — a lightweight one-way stream that pushes "a new update landed" so cards appear as people post, without WebSocket complexity. Render supports long-lived SSE connections cleanly.
- **Graceful fallback** to short-interval revalidation (refetch on focus / light polling) where a stream isn't held, so the board stays correct even if a connection drops.
- **Lead alerts** (new or persistent blockers, several people stuck) are delivered by email and, when the lead has the dashboard open, surfaced live over the same SSE channel.

This gives a live-feeling board at a fraction of the operational cost of a full realtime backend.

---

## 10. Caching

- **Edge / Next.js:** static assets and shell served from Vercel's CDN; read-mostly server-rendered views use segment caching and request memoization, with cache revalidation on write.
- **AI summaries:** the single most expensive operation, so it's cached hard (see §11) — regenerated only when the underlying updates change or a lead explicitly refreshes.
- **Hot read models:** a small in-process TTL cache on Express holds rarely-changing data like a team's roster and roles, invalidated on the relevant writes.
- **No Redis by default.** Persisting the AI summary in Postgres and using an in-process cache covers the real hot paths without adding a cache tier to operate and pay for. A managed Redis (e.g. Upstash) is a clean upgrade path if multi-instance shared caching or distributed rate-limit state later becomes necessary — but it is intentionally not part of the baseline.

---

## 11. AI Insights (Gemini)

The assistant turns "a screen of updates" into "here's what matters," and it **only ever speaks from what people actually wrote** — real names, real tasks, real blockers. Its job is to summarize the day, name who's blocked (flagging a blocker carried several days as more urgent than a fresh one), notice repeated tasks, highlight risks like several people waiting on the same thing, and suggest follow-ups. If there's little data, it says so rather than inventing progress.

**Orchestration and grounding.** Express assembles the prompt strictly from the team's real standups for the day, sends one batched call covering the whole team (not one call per person), and constrains the model to a summary-only role. Standup text is treated as **untrusted input**: the model is instructed to summarize it, never to follow instructions embedded inside it, and the output is validated before it's shown — a basic guard against prompt injection through update text.

**Caching and cost.** The generated summary is stored in Postgres keyed by team and standup date, alongside a fingerprint of the updates it was built from. It's served from that cache until the updates change or a lead asks for a refresh, so repeated dashboard loads cost nothing extra. A fast, low-cost Gemini tier (Flash-class) with a capped output length is used, since the task is summarization rather than deep reasoning.

**Degradation.** AI is never on the critical path. If Gemini is slow or down, the dashboard shows every real update as normal with a small "summary unavailable right now" note, and the summary reappears on its own once the service recovers.

---

## 12. Notifications & Scheduling

Two gentle pushes, no noise. **Member reminders** fire near the start of each person's own working day if they haven't posted, timed to their local clock and cleared the moment they submit. **Lead alerts** surface something worth attention — a new blocker, several people stuck — so a lead doesn't sit refreshing all day.

A **single scheduler** (Render Cron or an advisory-lock-guarded worker) evaluates due reminders and alert conditions on a short interval and dispatches through SMTP. Email sending is **queued and retried with backoff**, and runs off the request path, so a slow mail provider never blocks a user action and a transient failure doesn't drop the message.

---

## 13. Scalability

- **Stateless web tier.** JWT-based auth means Express instances share nothing; Render scales them horizontally with no affinity.
- **Database.** Neon autoscales compute and the pooled endpoint caps connections so a burst of instances doesn't exhaust Postgres. The morning submit spike is handled as many small, independent, idempotent upserts that never contend on the same row across users.
- **Read path.** Dashboard queries are selective by design — always scoped to one team and backed by indexes on the team, user, and submission-time dimensions, so a per-user "latest update" lookup stays cheap as teams grow.
- **AI path.** The most expensive and rate-limited dependency is shielded by caching, batching, and async generation, so it never gatekeeps concurrency.
- **Scheduler.** Kept singleton so scaling the web tier never multiplies reminders.

The result handles high concurrent morning usage without a queue broker or a cache cluster in the baseline.

---

## 14. Security

- **Isolation:** every team lives behind an application-enforced tenant boundary; cross-team reads are impossible through the data layer, with optional Postgres RLS as a hard backstop.
- **Transport:** TLS end to end (Vercel and Render terminate HTTPS); data is never in the clear between the browser and the app.
- **Credentials:** passwords hashed with a memory-hard function; tokens `httpOnly`/`Secure`/`SameSite` and never exposed to client JS; invite and reset tokens single-use, expiring, and hashed at rest.
- **Per-request authorization:** identity, team, and role re-verified on every request rather than trusted after login.
- **Input & surface hardening:** Zod schema validation at every endpoint (rejecting malformed or oversized input before it reaches domain logic), CORS locked to the Vercel origin, CSRF defense on cookie flows, and rate limiting on auth and AI endpoints.
- **Secrets & least privilege:** credentials in managed environment secrets, a least-privilege database role, and standup text treated as untrusted when it reaches the AI.

---

## 15. Performance

The screens people use most — the member home page and the lead dashboard — are server-rendered and stream fast, with skeletons so the shell appears instantly. Submitting confirms immediately via optimistic UI reconciled against the server. Heavy work (the AI reading the whole team) runs off the render path and slots in when ready, so it never freezes the board. Queries are indexed and tenant-scoped, history is paginated, and the app avoids re-doing work through caching, so common views stay snappy even with the whole team online at once.

---

## 16. Fault Tolerance & Resilience

The guiding rule is that a problem in one corner never takes down the whole experience — worst case is a clear, honest message and a way forward, never a blank screen or a lost update.

- **Never lose an update.** Submits are atomic transactions and idempotent upserts, so a retry after a flaky connection reconciles instead of duplicating, and a failed send surfaces a plain "try again" without swallowing what was typed.
- **Isolated failures.** A slow or down AI shows "summary unavailable" while every real update renders normally. A slow mail provider doesn't block user actions because email is queued and retried.
- **Transient errors** to the database, Gemini, or SMTP use timeouts and backoff retries; Gemini calls are time-boxed so a hung dependency can't stall a request.
- **Infrastructure recovery.** Render health checks restart unhealthy instances; Neon provides managed durability and high availability; structured logging plus error tracking (e.g. Sentry) give visibility to fix issues before they spread.

---

## 17. Cost Optimization

- **AI is the main variable cost**, so it's minimized structurally: cache summaries and regenerate only on change or explicit refresh, batch the whole team into one call, use a fast low-cost Gemini tier, and cap output tokens.
- **No cache tier or message broker** in the baseline — Postgres plus in-process caching removes the recurring cost and operational overhead of Redis until scale genuinely demands it.
- **Neon:** the pooled endpoint avoids over-provisioning connections, and non-production branches scale to zero when idle.
- **Render:** one right-sized always-on service plus a cron for scheduling, rather than a fleet of workers.
- **Vercel:** caching and ISR keep compute low by serving read-mostly views from the edge.
- **Email:** invites, resets, reminders, and alerts are low-volume and throttled, so a modest SMTP tier suffices.

---

## 18. Key Workflows (end to end)

**Team creation & onboarding.** Someone chooses "start a team," providing name, email, password, and team name. One step provisions a private tenant and makes them owner-admin. From the dashboard they add members by name and email; each receives an emailed, single-use invite to set a password, after which their account is tied to that one team.

**Daily standup.** A member signs in and lands on their home screen, which already shows either today's update to confirm/tweak or a fresh form, framed around their own current day. They answer the three questions; the server rejects only a fully blank submission, stamps the update with their UTC instant and derived local date, and confirms instantly. Edits are allowed until their local day rolls over, carrying an "edited" marker.

**Lead dashboard & AI.** A lead signs in to the team board — latest update per person, blockers surfaced, "no update yet" marked, each card labeled with the writer's own day. A cached Gemini summary sits at the top; the date picker realigns the board to each person's version of any chosen past day.

**Reminders & alerts.** The scheduler checks each user against their local clock and nudges those who haven't posted by their morning, and alerts leads when blockers appear — all over SMTP, with the dashboard reflecting new posts live via SSE.

---

*This design is intentionally lean: it meets high concurrent usage, correct per-person time zones, strict tenant isolation, and grounded AI insight without a message broker, a cache cluster, or a second datastore in the baseline — each of which is a documented, additive upgrade path rather than day-one complexity.*
