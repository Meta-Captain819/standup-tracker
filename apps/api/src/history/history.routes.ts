
import { Router } from "express";
import { authenticate } from "../auth/authenticate";
import { requireRole } from "../auth/authorize";
import { Role } from "../generated/prisma/client";
import { validate } from "../shared/validate";
import { myHistoryQuerySchema, teamHistoryQuerySchema } from "./history.schemas";
import * as history from "./history.service";

export const historyRouter = Router();

historyRouter.get("/me", authenticate, async (req, res) => {
  const { cursor } = validate(myHistoryQuerySchema, req.query);
  const result = await history.getMyHistory(req.auth!, cursor);
  res.json(result);
});

historyRouter.get(
  "/team",
  authenticate,
  requireRole(Role.LEAD, Role.OWNER_ADMIN),
  async (req, res) => {
    const { date } = validate(teamHistoryQuerySchema, req.query);
    const result = await history.getTeamHistoryForDate(req.auth!, date);
    res.json(result);
  },
);
