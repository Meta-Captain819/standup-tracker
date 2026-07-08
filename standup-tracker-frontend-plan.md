# Standup Tracker — Frontend Implementation Plan

> Frontend-only plan (pages, components, layouts, routing, client-side state).
> Sole sources of truth: `standup-tracker-workflow.md` and `standup-tracker-architecture.md`.
> No features, colors, or patterns are introduced beyond what those documents support.

---

## Grounding facts (current repo state)

- The frontend is still the untouched `create-next-app` scaffold — **Next.js 16.2.10, React 19, Tailwind v4, Zod 4, TypeScript 5**.
- This Next.js version renames **Middleware → `proxy.ts`**, and its own docs are explicit that proxy is for *optimistic* role redirects only, **not** session/auth enforcement — which matches the architecture doc (edge routes by role; Express re-authorizes every request).
- The design source is **prose, not a pixel spec**. "Color usage / visual hierarchy" is defined *semantically* (calm base, blockers visually obvious, "no update yet" as a gentle flag, edited marker subtle, on-track people look unremarkable). This plan encodes those semantic roles rather than inventing a palette the docs don't contain.

---

## Design language (derived strictly from the source docs)

The docs never give hex values; they give **intent**. These are the only visual rules the plan treats as "specified," and every phase must honor them:

| Semantic role | Source-doc basis | UI treatment |
|---|---|---|
| **Calm base** | "calm welcome screen," "no clutter," people cruising "look calm and unremarkable" | Neutral, low-contrast surface; generous whitespace; one clear action per screen |
| **Blocker = attention** | blockers "pulled out and made visually obvious," "eye drawn straight to people who need help" | The single accent that draws the eye; used only for blockers/alerts, nowhere decorative |
| **"No update yet" = gentle flag** | "clear marker," "visible, gentle flag," not hidden | Muted, unmistakable-but-not-alarming marker beside the name |
| **Edited marker** | "small marker that it was updated," must not mislead | Subtle inline label + timestamp, never competing with content |
| **Per-writer day/time label** | "each labelled with the writer's own day and local time"; Tuesday card next to Monday "nothing looks broken" | Every update/card carries an explicit local-day + local-time label as a first-class element |

---

## Standing requirements (built into *every* phase, not deferred)

- **Mobile-first responsive** at every breakpoint — never a retrofit phase. Correctness is a per-phase acceptance criterion.
- **Role-correct rendering is server-side.** A member never receives lead/admin markup — pages aren't rendered for them, not merely CSS-hidden (Golden Rule 5; architecture §3).
- **BFF stays thin** — authenticate the cookie, forward, shape nothing. No Prisma, no auth decisions, no domain logic in Next.js (Golden Rule 1).
- **Tokens never reach client JS** — session lives only in the httpOnly cookie on the Next origin (Golden Rule 6).
- **Timezone is captured silently via `Intl`** on login and each submit. **No timezone picker, ever** (§6).
- **No new infra** — no Redis / WebSockets / global state library; SSE + light polling only (§9).

---

## Client-side state (deliberately minimal — no global store)

The docs don't warrant a Redux/Zustand layer. State is:

- **Server-owned** (role, roster, updates, summary) → fetched in Server Components, passed as props.
- **Local/ephemeral** → React `useState`/`useOptimistic` inside the few client components (standup form, inline edit, date picker, SSE subscription).
- **Session** → httpOnly cookie only; role is read server-side per request.

---

## The 12 Phases

### Phase 1 — Foundation, theme tokens & app skeleton
**Objective:** Replace the scaffold with a clean, tokenized base.
**Scope:** Strip boilerplate `page.tsx`/assets; define Tailwind v4 theme in CSS (`@theme`) encoding the semantic roles above (calm-base, blocker-accent, no-update-muted, edited-subtle, on-track-neutral); typography scale + one font; spacing/radius scale; root `layout.tsx`; global reset; base metadata. Establish folder conventions (route groups + `_components`/`_lib` private folders).
**Done when:** App boots to a themed blank shell; tokens are the single source of color/spacing; no create-next-app remnants.

### Phase 2 — Shared presentational component system
**Objective:** Build the small, non-speculative primitive set the designs require — nothing generalized ahead of need.
**Scope:** `Button`, `TextField`/`Textarea`, `Card`, `Badge`/`Marker` (blocker, no-update, edited variants), `NameLabel` + `LocalDayTimeLabel`, `Skeleton`, `EmptyState`, `InlineError`/toast, form-field wrapper. All pure/presentational, driven only by tokens.
**Done when:** Each primitive renders responsively in isolation and maps directly to a design role; no primitive exists that no screen uses.

### Phase 3 — Routing structure, layouts & role gating
**Objective:** Establish the URL/layout map and optimistic edge routing.
**Scope:** Route groups `(marketing)`, `(auth)`, `(app)`; per-group `layout.tsx` (app shell with role-appropriate header/nav); `proxy.ts` for **optimistic** unauthenticated→`/signin` and role-based redirects (with the explicit understanding that Express is the real gate); `loading.tsx`, `error.tsx`, `not-found.tsx`, and the friendly "this area isn't available to you" out-of-role screen.
**Done when:** Navigating between groups shows correct shells/skeletons; proxy redirects by cookie presence + role; error/loading/not-found conventions render.

### Phase 4 — BFF route handlers, typed fetch client & timezone capture
**Objective:** Stand up the thin server-side data plumbing and client state utilities.
**Scope:** `route.ts` BFF handlers that unpack the cookie, attach the bearer token server-side, forward to Express, and return scoped JSON — shaping nothing. Typed fetch wrapper; **frontend copy of the Zod request schemas** (see gap note below) used at the BFF boundary; `Intl`-based timezone capture util injected on login/submit; a server-side session/role reader for layouts.
**Done when:** A page can call the BFF, which forwards with credentials and returns typed data; timezone is captured without any UI; malformed requests are rejected by Zod before forwarding.

### Phase 5 — Welcome / landing page
**Objective:** The calm two-door entry screen.
**Scope:** `(marketing)` landing: one-sentence purpose + **Sign in** / **Start a new team** doors, no clutter; auto-skip to home if already authenticated (server-side).
**Done when:** Renders calmly at all breakpoints; both doors route correctly; authenticated visitors bypass it.

### Phase 6 — Auth flows
**Objective:** All account-entry screens.
**Scope:** Sign in; Start-a-team (name/email/password/team name); Forgot-password; Reset-password; Accept-invite (set password). Client forms with the shared Zod schemas + structured errors; timezone captured on login; optimistic-safe submit states. All via BFF → Express.
**Done when:** Every auth path validates client-side, submits through the BFF, and surfaces clear errors; no token ever touches client JS.

### Phase 7 — Member home (view/confirm + recent history aside)
**Objective:** The member's landing screen framed around *their* current day.
**Scope:** Server-rendered home showing either today's update (confirm/tweak state) or the empty form entry point; recent-days updates in a quiet aside; everything labeled with the member's own local day (resolved server-side).
**Done when:** Home reflects the member's current local day correctly; recent history renders alongside; layout collapses gracefully on mobile.

### Phase 8 — Standup form: optimistic submit + inline edit
**Objective:** The three-question write/edit interaction — the heart of the app.
**Scope:** Client form for yesterday/today/blockers; schema rejects **only** the all-blank case (empty blocker allowed); `useOptimistic` submit reconciled against server confirmation with a clear "today's update — done" state; inline edit of today's update; **edited** marker + timestamp; failure preserves typed text with a retry (never swallows input).
**Done when:** Submit feels instant and reconciles; a failed write keeps the text and offers retry; edit updates latest text and shows the edited marker.

### Phase 9 — Lead/admin dashboard board
**Objective:** The whole team on one scannable screen.
**Scope:** Latest-update-per-person cards; **blockers visually surfaced** (accent role); **"no update yet"** markers; each card labeled with that writer's own day + local time (Tuesday-beside-Monday reads as correct); board streams first with skeletons. Role-gated to lead/admin server-side.
**Done when:** Board renders every real update with blockers drawing the eye, gaps marked, mixed local days labeled clearly; members can't reach it.

### Phase 10 — AI summary slot + live SSE freshness
**Objective:** Async enhancements that never block the board.
**Scope:** Streamed AI-summary region at the top that slots in when ready and shows **"summary unavailable right now"** on failure/slowness (never blocks real updates); SSE client subscribing to Express for new-update push + live lead blocker alerts; short-interval revalidation/refetch-on-focus fallback.
**Done when:** With AI down, the board is fully usable with the degradation note; new posts appear live via SSE; dropping the stream falls back to polling without breaking correctness.

### Phase 11 — History + per-person date picker
**Objective:** Backward browsing that stays honest across time zones.
**Scope:** Member's own past-updates view; lead's team past-day view rendered like the live board; **date picker** whose selection aligns each person to *their* local version of that date (match on each user's `localStandupDate`), never one UTC window; paginated history.
**Done when:** "Show me Monday" pulls each person's personal Monday; member and lead history render consistently with the live board styling.

### Phase 12 — Admin roster controls (+ final consistency QA)
**Objective:** The admin room for changing the team itself.
**Scope:** Add member (name/email → invite sent); set/change role (member ↔ lead); remove member (revokes access, history retained — copy reflects this). Admin-only, server-gated. Close with a consistency sweep: confirm empty/error/loading/skeleton states, responsive behavior, and the semantic color roles are uniform across all screens.
**Done when:** Admin can manage the roster; the whole frontend passes a single visual-consistency and responsive pass with no orphaned states.

---

## Two things to flag rather than silently work around

1. **Shared Zod schema gap (CLAUDE.md §3/§7).** There is no `packages/shared` and no workspace spanning `backend` + `frontend` (different package managers; frontend is its own git root). This plan keeps a **frontend-local copy** of request schemas (Phase 4) that must mirror Express — a real drift risk. Recommended resolution before Phase 6 ships: either (a) stand up genuine workspace tooling spanning both apps, or (b) generate the frontend schemas from a single published source. The plan works either way, but this needs an explicit decision.

2. **Explicitly out of scope** (not in the source docs, so not built): any timezone picker, dark-mode-toggle feature, member self-signup, WebSockets, client-side global state store, or any AI interaction beyond the read-only day summary. Reminders themselves are email/scheduler concerns (backend); the frontend's only notification surface is the **live lead alert** on the dashboard (Phase 10).
