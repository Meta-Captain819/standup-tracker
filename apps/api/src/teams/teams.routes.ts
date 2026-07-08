
import { Router } from "express";
import { authenticate } from "../auth/authenticate";
import { requireRole } from "../auth/authorize";
import { Role } from "../generated/prisma/client";
import { validate } from "../shared/validate";
import { addMemberSchema, memberParamsSchema, setRoleSchema } from "./teams.schemas";
import * as teams from "./teams.service";

export const teamsRouter = Router();

const ownerAdminOnly = [authenticate, requireRole(Role.OWNER_ADMIN)] as const;


teamsRouter.post("/members", ...ownerAdminOnly, async (req, res) => {
  const member = await teams.addMember(req.auth!, validate(addMemberSchema, req.body));
  res.status(201).json(member);
});

teamsRouter.get("/members", ...ownerAdminOnly, async (req, res) => {
  const members = await teams.listRoster(req.auth!);
  res.json(members);
});


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
