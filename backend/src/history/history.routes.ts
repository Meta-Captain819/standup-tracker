// /history REST surface (implementation plan Phase 2). Async errors propagate to the terminal error
// handler (Express 5 forwards rejected promises automatically).
import { Router } from "express";
import { authenticate } from "../auth/authenticate";
import { requireRole } from "../auth/authorize";
import { Role } from "../generated/prisma/client";
import { validate } from "../shared/validate";
import { myHistoryQuerySchema, teamHistoryQuerySchema } from "./history.schemas";
import * as history from "./history.service";

export const historyRouter = Router();

// The caller's own timeline — any authenticated active user, own data only, no role gate (same posture as
// /standups/me/*).
historyRouter.get("/me", authenticate, async (req, res) => {
  const { cursor } = validate(myHistoryQuerySchema, req.query);
  const result = await history.getMyHistory(req.auth!, cursor);
  res.json(result);
});

// The whole team's board for a chosen past day — lead/owner-admin only; a member is 403'd before the
// handler runs.
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
