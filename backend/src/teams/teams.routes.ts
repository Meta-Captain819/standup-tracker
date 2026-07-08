// /teams/* REST surface (implementation plan Phase 1/2). Every route: authenticate → requireRole
// (owner-admin) → validate → operate → return scoped result. Async errors propagate to the terminal
// error handler (Express 5 forwards rejected promises automatically).
import { Router } from "express";
import { authenticate } from "../auth/authenticate";
import { requireRole } from "../auth/authorize";
import { Role } from "../generated/prisma/client";
import { validate } from "../shared/validate";
import { addMemberSchema, memberParamsSchema, setRoleSchema } from "./teams.schemas";
import * as teams from "./teams.service";

export const teamsRouter = Router();

// Roster management is owner-admin only; a member/lead is blocked with 403 before any handler runs.
const ownerAdminOnly = [authenticate, requireRole(Role.OWNER_ADMIN)] as const;

// ── Phase 1: add member & list roster ─────────────────────────────────────────────────────────────

teamsRouter.post("/members", ...ownerAdminOnly, async (req, res) => {
  const member = await teams.addMember(req.auth!, validate(addMemberSchema, req.body));
  res.status(201).json(member);
});

teamsRouter.get("/members", ...ownerAdminOnly, async (req, res) => {
  const members = await teams.listRoster(req.auth!);
  res.json(members);
});

// ── Phase 2: role change & removal ────────────────────────────────────────────────────────────────

teamsRouter.patch("/members/:userId/role", ...ownerAdminOnly, async (req, res) => {
  const { userId } = validate(memberParamsSchema, req.params);
  const { role } = validate(setRoleSchema, req.body);
  const member = await teams.setRole(req.auth!, userId, role);
  res.json(member);
});

teamsRouter.delete("/members/:userId", ...ownerAdminOnly, async (req, res) => {
  const { userId } = validate(memberParamsSchema, req.params);
  await teams.removeMember(req.auth!, userId);
  res.status(204).end();
});
