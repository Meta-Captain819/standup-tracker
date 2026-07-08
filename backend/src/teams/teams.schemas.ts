// Teams & Membership request schemas — the single source of shape for the roster surface
// (implementation plan Phase 1/2; Golden Rule 4, CLAUDE §7). Types are inferred from these schemas;
// both service and routes consume them.
//
// FLAG (CLAUDE §3/§7): the `email`/`displayName` field rules below duplicate identity.schemas.ts.
// They must be SHARED, not hand-copied — same backend-owned-schema gap already recorded there (no
// workspace/`packages/shared` yet). Keep them byte-for-byte in sync until that package exists.
import { z } from "zod";
import { Role } from "../generated/prisma/client";

// Normalized to match identity exactly: email trimmed + lowercased before format validation so global
// uniqueness and login lookups match regardless of casing/whitespace.
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const displayName = z.string().trim().min(1).max(120);

// ── Phase 1: add member ─────────────────────────────────────────────────────────────────────────

export const addMemberSchema = z.object({
  name: displayName,
  email,
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

// ── Phase 2: role change & removal ────────────────────────────────────────────────────────────────

// The `:userId` route param. cuid matches the id format Prisma mints (`@default(cuid())`); a malformed
// id is rejected at the boundary, while a well-formed but cross-team id falls through to a scoped
// not-found via `forTeam`.
export const memberParamsSchema = z.object({ userId: z.cuid() });
export type MemberParams = z.infer<typeof memberParamsSchema>;

// A member may only ever be flipped between LEAD and MEMBER through this endpoint — OWNER_ADMIN is
// never grantable here (plan Phase 2; only signup mints the owner-admin).
export const setRoleSchema = z.object({
  role: z.enum([Role.LEAD, Role.MEMBER]),
});
export type SetRoleInput = z.infer<typeof setRoleSchema>;
