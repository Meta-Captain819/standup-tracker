
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


standupsRouter.post("/", authenticate, async (req, res) => {
  const result = await standups.submitStandup(req.auth!, validate(submitStandupSchema, req.body));
  res.json(result);
});


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
