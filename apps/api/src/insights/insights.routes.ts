
import { Router } from "express";
import { authenticate } from "../auth/authenticate";
import { requireRole } from "../auth/authorize";
import { aiRateLimiter } from "../auth/rateLimit";
import { Role } from "../generated/prisma/client";
import { validate } from "../shared/validate";
import { summaryDateInputSchema } from "./insights.schemas";
import * as insights from "./insights.service";

export const insightsRouter = Router();

const leadOrAdmin = [authenticate, requireRole(Role.LEAD, Role.OWNER_ADMIN), aiRateLimiter] as const;

insightsRouter.get("/summary", ...leadOrAdmin, async (req, res) => {
  const { standupDate } = validate(summaryDateInputSchema, req.query);
  const result = await insights.getDaySummary(req.auth!, standupDate, { refresh: false });
  res.json(result);
});

insightsRouter.post("/summary/refresh", ...leadOrAdmin, async (req, res) => {
  const { standupDate } = validate(summaryDateInputSchema, req.body);
  const result = await insights.getDaySummary(req.auth!, standupDate, { refresh: true });
  res.json(result);
});
