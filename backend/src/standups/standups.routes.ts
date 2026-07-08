// /standups/* REST surface (implementation plan Phase 4/5). Every route: authenticate → validate →
// operate → return. Any active, authenticated user may post and read their OWN update — no role gate
// (a member manages only their own). Docs mandate rate limiting only on auth and AI endpoints, so none
// is added here (CLAUDE §5). Async errors propagate to the terminal error handler (Express 5).
import { Router } from "express";
import { authenticate } from "../auth/authenticate";
import { validate } from "../shared/validate";
import {
  standupIdParamsSchema,
  submitStandupSchema,
  todayQuerySchema,
} from "./standups.schemas";
import * as standups from "./standups.service";

export const standupsRouter = Router();

// ── Phase 4: submit ─────────────────────────────────────────────────────────────────────────────

standupsRouter.post("/", authenticate, async (req, res) => {
  const result = await standups.submitStandup(req.auth!, validate(submitStandupSchema, req.body));
  res.json(result);
});

// ── Phase 5: edit & member read of own updates ────────────────────────────────────────────────────

standupsRouter.get("/me/today", authenticate, async (req, res) => {
  const { timezone } = validate(todayQuerySchema, req.query);
  const result = await standups.getMyToday(req.auth!, timezone);
  res.json(result);
});

standupsRouter.get("/me/recent", authenticate, async (req, res) => {
  const result = await standups.getMyRecent(req.auth!);
  res.json(result);
});

standupsRouter.patch("/:id", authenticate, async (req, res) => {
  const { id } = validate(standupIdParamsSchema, req.params);
  const result = await standups.editStandup(req.auth!, id, validate(submitStandupSchema, req.body));
  res.json(result);
});
