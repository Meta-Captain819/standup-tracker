# Standup Tracker

A multi-tenant SaaS for async daily standups. Teams post a daily update (yesterday / today / blockers), leads get a live board with AI summaries and blocker alerts, and members get local-morning reminders to post.

Monorepo: an Express + Prisma API (`apps/api`) and a Next.js web app (`apps/web`).
NOTE: Backend is deployed on render free service so the first request might take ~1min to respond.

## Features

- **Daily standups** — one update per person per local day (yesterday, today, blockers). Timezone-aware: "today" belongs to the writer's IANA zone. Updates are editable and kept in history.
- **Live team board** — real-time board (SSE) showing every member's latest update for the day.
- **AI summaries** — per-team, per-day digest of the day's updates via Google Gemini. Optional and non-blocking: the board works fully without a key.
- **Blocker alerts** — leads/admins are notified of new or persistent blockers.
- **Reminders** — members get a durable in-app + email reminder in their local morning if they haven't posted.
- **History** — browse past days per team, aligned by local calendar date.
- **Roles** — `OWNER_ADMIN`, `LEAD`, `MEMBER`, resolved server-side per request. Members never receive lead/admin data.
- **Team onboarding** — start a team, invite members by email, accept invites, password reset. Single-use, hashed, expiring tokens.
- **Auth** — JWT access + rotating refresh tokens (reuse detection); web sessions in an encrypted httpOnly cookie.
- **Tenant isolation** — every team-owned row carries a `teamId`; all team-scoped queries go through a tenant-scoping data-access wrapper.

## Tech stack

- **API**: Node 22+, Express 5, Prisma 7 (PostgreSQL / Neon), Zod, Argon2, JWT, Nodemailer, Luxon, Google GenAI.
- **Web**: Next.js 16, React 19, Tailwind CSS 4, `jose`. The web app is a BFF that proxies to the API.
- **DB**: PostgreSQL (built for Neon — pooled endpoint at runtime, direct endpoint for migrations).

## Setup

### Prerequisites
- Node.js >= 22
- `pnpm` (web) and `npm` (api)
- A PostgreSQL database (Neon recommended)

### 1. Install dependencies
```bash
npm run install:all
```

### 2. Configure environment

**`apps/api/.env`** (copy from `.env.example`):
- `DATABASE_URL` — Neon pooled endpoint (runtime)
- `DIRECT_URL` — Neon direct endpoint (migrations only)
- `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET` — JWT secrets
- `CORS_ORIGIN` / `WEB_APP_URL` — the web origin (e.g. `http://localhost:3000`)
- `GEMINI_API_KEY` *(optional)* — enables AI summaries
- `SMTP_*` *(optional)* — enables invite/reset/reminder emails (log-only if unset)

**`apps/web/.env.local`** (copy from `.env.example`):
- `BACKEND_API_URL` — the API origin (e.g. `http://localhost:4000`)
- `SESSION_SECRET` — >= 32 chars; generate with `openssl rand -base64 32`

### 3. Run database migrations
```bash
npm --prefix apps/api exec prisma migrate deploy
```

### 4. Seed demo data (optional)

Populate the database with a demo team, members, and a week of standups so you can log in and see
the app in use straight away:

```bash
npm --prefix apps/api run seed
```

The seed **wipes all existing data first**, then recreates the demo tenant — re-run it any time to
get back to a clean, known state. See [Try it — demo accounts](#try-it--demo-accounts) below for the
credentials it creates.

## Try it — demo accounts

After running the seed, open http://localhost:3000 and sign in with any account below. **Every
account uses the same password:**

```
Password: standup123
```

Team: **Orbit Labs**

| Name | Email | Role | Timezone | Status |
| --- | --- | --- | --- | --- |
| Ava Thompson | `ava@orbitlabs.dev` | Owner-admin | America/New_York | Active |
| Liam Chen | `liam@orbitlabs.dev` | Lead | America/Los_Angeles | Active |
| Sofia Garcia | `sofia@orbitlabs.dev` | Member | Europe/Madrid | Active |
| Noah Patel | `noah@orbitlabs.dev` | Member | Asia/Kolkata | Active |
| Emma Novak | `emma@orbitlabs.dev` | Member | Europe/Berlin | Active |
| Yuki Tanaka | `yuki@orbitlabs.dev` | Member | Asia/Tokyo | Active |
| Oliver Brooks | `oliver@orbitlabs.dev` | Member | Europe/London | Pending invite (can't log in) |

- Sign in as **Ava** (owner-admin) or **Liam** (lead) to see the live team board, AI summaries, and
  blocker alerts, and to manage the roster from the Team page.
- Sign in as any **Member** to post/edit your own standup and browse history.
- **Oliver** is an invited member who hasn't accepted yet, so he has no password and appears as
  *pending* on the roster — he's there to show what a pending invite looks like.

> **Note on email:** invites, password resets, reminders, and blocker alerts are implemented over
> **SMTP** (Nodemailer), but email delivery **won't actually work out of the box** because the
> `SMTP_*` environment values aren't set. With SMTP unset the email queue safely degrades to
> log-only (nothing is sent, no error), so all other features work normally. To enable real email,
> fill in `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` in `apps/api/.env`.

## Running

Start the API and web app in separate terminals:
```bash
npm run dev:api   # API on http://localhost:4000
npm run dev:web   # Web on http://localhost:3000
```

Open http://localhost:3000, **Start a team** to create the first owner-admin, then invite members.

## Usage

1. **Start a team** — creates the team and its owner-admin account.
2. **Invite members** — from the Team page; they receive an invite link to set a password.
3. **Post your standup** — from the dashboard, submit yesterday / today / blockers (once per local day, editable).
4. **Review the board** — see the live team board, AI summary, and blocker alerts.
5. **Browse history** — view past days on the History page.

## Scripts (root)

| Command | Description |
| --- | --- |
| `npm run install:all` | Install api + web dependencies |
| `npm run dev:api` / `dev:web` | Run in development |
| `npm run start:api` / `start:web` | Run in production |
| `npm run build:web` | Build the web app |
| `npm run typecheck` | Typecheck both apps |
| `npm test` | Run API tests |
| `npm --prefix apps/api run seed` | Wipe data and seed the demo team + accounts |
