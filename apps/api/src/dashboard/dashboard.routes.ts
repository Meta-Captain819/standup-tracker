
import { Router } from "express";
import { authenticate } from "../auth/authenticate";
import { requireRole } from "../auth/authorize";
import { Role } from "../generated/prisma/client";
import { validate } from "../shared/validate";
import { boardQuerySchema } from "./dashboard.schemas";
import * as dashboard from "./dashboard.service";

export const dashboardRouter = Router();

const leadOrAdmin = [authenticate, requireRole(Role.LEAD, Role.OWNER_ADMIN)] as const;

dashboardRouter.get("/", ...leadOrAdmin, async (req, res) => {
  const { date } = validate(boardQuerySchema, req.query);
  const result = date
    ? await dashboard.getDateBoard(req.auth!, date)
    : await dashboard.getLiveBoard(req.auth!);
  res.json(result);
});
