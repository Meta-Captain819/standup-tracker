// /insights/* REST surface (AI module plan Phase 6). Every route: authenticate → requireRole
// (lead/owner-admin) → rate-limit → validate → operate → return scoped result. A member is blocked with
// 403 before any handler runs (CLAUDE §5/§8) and never receives AI markup or data. AI is off the critical
// path: handlers never throw on a Gemini failure — `getDaySummary` returns an honest "unavailable" signal
// so the dashboard renders every real update and the summary slots in once the service recovers. Async
// errors propagate to the terminal error handler (Express 5 forwards rejected promises automatically).
import { Router } from "express";
import { authenticate } from "../auth/authenticate";
import { requireRole } from "../auth/authorize";
import { aiRateLimiter } from "../auth/rateLimit";
import { Role } from "../generated/prisma/client";
import { validate } from "../shared/validate";
import { summaryDateInputSchema } from "./insights.schemas";
import * as insights from "./insights.service";

export const insightsRouter = Router();

// The team board's AI summary is lead/owner-admin only; rate-limited after auth so only authenticated
// lead/admin calls consume the AI budget.
const leadOrAdmin = [authenticate, requireRole(Role.LEAD, Role.OWNER_ADMIN), aiRateLimiter] as const;

// Get the day's summary — served from cache, regenerating only if the source updates changed since it
// was cached.
insightsRouter.get("/summary", ...leadOrAdmin, async (req, res) => {
  const { standupDate } = validate(summaryDateInputSchema, req.query);
  const result = await insights.getDaySummary(req.auth!, standupDate, { refresh: false });
  res.json(result);
});

// Explicit lead refresh — force exactly one regeneration for the day even if the cache is current.
insightsRouter.post("/summary/refresh", ...leadOrAdmin, async (req, res) => {
  const { standupDate } = validate(summaryDateInputSchema, req.body);
  const result = await insights.getDaySummary(req.auth!, standupDate, { refresh: true });
  res.json(result);
});
