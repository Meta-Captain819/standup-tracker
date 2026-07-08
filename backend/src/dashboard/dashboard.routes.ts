// /dashboard REST surface (implementation plan Phase 1). Every route: authenticate → requireRole
// (lead/owner-admin) → validate → operate → return scoped result. A member is blocked with 403 before any
// handler runs and never receives board markup or data (CLAUDE §5). Read-only. Async errors propagate to
// the terminal error handler (Express 5 forwards rejected promises automatically).
import { Router } from "express";
import { authenticate } from "../auth/authenticate";
import { requireRole } from "../auth/authorize";
import { Role } from "../generated/prisma/client";
import { validate } from "../shared/validate";
import { boardQuerySchema } from "./dashboard.schemas";
import * as dashboard from "./dashboard.service";

export const dashboardRouter = Router();

const leadOrAdmin = [authenticate, requireRole(Role.LEAD, Role.OWNER_ADMIN)] as const;

// The board: no `date` → the live board; `?date=YYYY-MM-DD` → the date-picker board for that past day.
dashboardRouter.get("/", ...leadOrAdmin, async (req, res) => {
  const { date } = validate(boardQuerySchema, req.query);
  const result = date
    ? await dashboard.getDateBoard(req.auth!, date)
    : await dashboard.getLiveBoard(req.auth!);
  res.json(result);
});
