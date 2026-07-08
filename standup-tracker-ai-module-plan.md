# AI Insights Module — Phased Implementation Plan

Scope: the **AI Insights** backend module only (`backend/src/insights`), as defined in
`standup-tracker-architecture.md` §2/§11 and `CLAUDE.md` §8. This plan covers the Express-side
orchestration of Gemini: grounding, generation, caching, exposure, and graceful degradation. **No UI.**

## Ground rules carried into every phase

These are invariants from `CLAUDE.md` and the architecture doc, not per-phase choices:

- **Express is the single source of truth.** All logic lives in the `insights` module. Nothing here goes into Next.js.
- **Tenant-scoped always.** Every read/write goes through the tenant-scoping data-access wrapper with the caller's `teamId`. Cache rows carry `teamId`.
- **AI is never on the critical path.** The dashboard renders every real update with Gemini down; the summary is an enhancement that can fail.
- **Standup text is untrusted input.** The model summarizes it and never follows instructions embedded inside it; output is validated before it is stored or returned.
- **Grounded only.** Every observation traces to a real standup. With little data, the summary says so — it never invents progress.
- **Cross-module reads go through service functions.** The `insights` module pulls the day's standups via the `standups`/`dashboard` module's own service functions, never directly into their data layer.
- **Zod at the boundary.** Every endpoint parses body/query/params before any logic runs.
- **Secrets in env.** `GEMINI_API_KEY` and tier/output/timeout config come from environment only.
- **No unsanctioned infra.** Cache is Postgres + the existing in-process TTL layer. No Redis, no queue broker.

---

## Phase 1 — Persistence & module scaffold

**Objective:** Establish the durable cache and the module skeleton that later phases fill in.

**Scope:**
- Add the **cached-summary entity** (Prisma): keyed by `(teamId, standupDate)`, carrying the summary payload, a **fingerprint** of the source updates, and generated-at timestamp. `teamId` is a tenant-owned column; index on `(teamId, standupDate)`.
- Migration runs against **`DIRECT_URL`** (never the pooler).
- Create the `insights` module directory with the standard layout used by other domain modules (service / data-access / schemas), routed through the shared **tenant-scoping wrapper** for all cache reads and writes.
- Define Zod schemas for the module's inputs: the `standupDate` (a validated calendar date) and the refresh flag. Derive types from the schemas.

**Done when:** the cache table exists via a `DIRECT_URL` migration, and the module can read/write a cache row only within a `teamId` scope. No Gemini calls yet.

---

## Phase 2 — Gemini client wrapper

**Objective:** One small, safe boundary to Gemini that every generation call goes through.

**Scope:**
- A thin client configured from env: a **fast, low-cost (Flash-class) tier**, a **capped output length**, and a **hard time-box** on the call.
- **Backoff retry** on transient failures only; a hung dependency is cut off by the time-box so it can never stall a caller.
- The wrapper exposes a single "summarize these updates" call and returns either a raw model response or a typed failure — it makes no product decisions and holds no prompt logic.

**Done when:** the client can issue a time-boxed, capped, retryable Gemini call and surfaces failure as a value (never a thrown, un-time-boxed hang). Key read from env only.

---

## Phase 3 — Grounding & prompt assembly

**Objective:** Turn a team's real standups for a day into a deterministic prompt and fingerprint — with no external calls.

**Scope:**
- Gather the team's **real standups for the given `standupDate`** through the `standups`/`dashboard` service functions, tenant-scoped. Each person's local-day alignment is already resolved upstream; this phase consumes it, it does not redo date math.
- Compute a **deterministic fingerprint** of those source updates (used later for cache validity).
- Build the **grounded, summarize-only prompt**: constrain the model to summarizing what was actually written and produce exactly the outputs the docs specify — day summary, who is blocked (a blocker carried several days flagged as more urgent than a fresh one), repeated tasks, risks (e.g. several people waiting on the same thing), and follow-up suggestions.
- Frame standup text as **untrusted**: instruct the model to summarize it and ignore any instructions embedded inside it. Handle the low/no-data case explicitly in the prompt.
- This is a pure, testable transform: `(standups for day) → (prompt, fingerprint)`. No Gemini call here.

**Done when:** given a day's tenant-scoped standups, the module produces a stable prompt and fingerprint deterministically.

---

## Phase 4 — Generation & output validation

**Objective:** Produce a validated summary object from the prompt via one batched call.

**Scope:**
- Issue **one batched Gemini call for the whole team** (never one per person) through the Phase 2 client.
- **Validate the model output with Zod** into the module's summary shape before it is trusted — the guard against prompt-injection leakage and malformed responses. Reject/treat-as-failure anything that doesn't parse.
- On any failure (time-box, transient error exhausted, invalid output), return a typed "generation failed" result — never a partial or fabricated summary.

**Done when:** a valid prompt yields either a schema-validated summary object or a clean typed failure. No caching or HTTP yet.

---

## Phase 5 — Caching & invalidation

**Objective:** Serve summaries from Postgres and regenerate only when they are genuinely stale.

**Scope:**
- **Read-through by `(teamId, standupDate)`:** if a cached row exists and its stored fingerprint matches the current source-updates fingerprint (Phase 3), serve the cache — no Gemini call.
- **Regenerate** (Phase 3 → 4) only when the fingerprint differs (updates changed) or a **lead explicitly refreshes**. Persist the new summary with its fingerprint.
- On successful regeneration, invalidate the relevant hot read-model entry per the existing in-process TTL cache rules.
- Never call Gemini on an unchanged, already-cached day.

**Done when:** repeated requests for an unchanged day cost nothing extra; changed updates or an explicit refresh trigger exactly one regeneration.

---

## Phase 6 — API surface, authorization & graceful degradation

**Objective:** Expose the module as a small REST surface that is safe, off the critical path, and degrades honestly.

**Scope:**
- Express endpoints under the `insights` group: **get the day's summary** and **refresh the summary**. Each follows *validate → authorize → scope → operate → return scoped result*.
- **Re-authorize on every request:** verify identity, team membership, and role. Access is limited to **`lead` and `owner-admin`**; `member` is blocked. Return only tenant-scoped data.
- **Rate-limit** the AI endpoints (auth/AI endpoints are rate-limited per §14/§8).
- **Off the critical path:** the dashboard's real updates never wait on this. On failure, slow response, or a cache-miss mid-generation, the endpoint returns a **"summary unavailable right now"** signal so the board renders every real update normally and the summary slots in once it recovers.
- **Structured logging + error tracking** on the generation and degradation paths; no swallowed errors.

**Done when:** leads/admins can fetch or refresh a grounded, cached summary; members are blocked; every failure path returns an honest "unavailable" without ever blocking or blanking the dashboard.

---

## Definition of done (whole module)

- [ ] Every cache read/write is tenant-scoped by `teamId`; the cache row carries `teamId`.
- [ ] Prompt is built strictly from the team's real standups for the day; low/no-data is stated, never invented.
- [ ] One batched Gemini call; standup text treated as untrusted; output Zod-validated before storage/return.
- [ ] Summary cached in Postgres keyed by `(teamId, standupDate)` with a source fingerprint; regenerated only on change or explicit refresh.
- [ ] Gemini uses a fast low-cost tier, capped output, and a hard time-box with backoff.
- [ ] Endpoints re-check identity/team/role; only `lead`/`owner-admin` reach them; AI endpoints are rate-limited.
- [ ] AI is never on the render path; failure degrades to "summary unavailable" with all real updates intact.
- [ ] `GEMINI_API_KEY` and tuning come from env; no secrets in code or logs.
- [ ] Migration targets `DIRECT_URL`; no Redis/queue/second store added.
