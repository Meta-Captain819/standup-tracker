
import { Router } from "express";
import { authenticate } from "../auth/authenticate";
import { authRateLimiter } from "../auth/rateLimit";
import { validate } from "../shared/validate";
import {
  acceptInviteSchema,
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  resetPasswordSchema,
  signupSchema,
} from "./identity.schemas";
import * as identity from "./identity.service";

export const identityRouter = Router();


identityRouter.post("/signup", authRateLimiter, async (req, res) => {
  const result = await identity.signup(validate(signupSchema, req.body));
  res.status(201).json(result);
});

identityRouter.post("/login", authRateLimiter, async (req, res) => {
  const result = await identity.login(validate(loginSchema, req.body));
  res.json(result);
});

identityRouter.post("/refresh", authRateLimiter, async (req, res) => {
  const result = await identity.refresh(validate(refreshSchema, req.body));
  res.json(result);
});

identityRouter.post("/logout", async (req, res) => {
  await identity.logout(validate(logoutSchema, req.body));
  res.status(204).end();
});

identityRouter.get("/me", authenticate, async (req, res) => {
  const me = await identity.getProfile(req.auth!);
  res.json(me);
});


identityRouter.post("/invitations/accept", authRateLimiter, async (req, res) => {
  const result = await identity.acceptInvite(validate(acceptInviteSchema, req.body));
  res.json(result);
});

identityRouter.post("/password/forgot", authRateLimiter, async (req, res) => {
  await identity.requestPasswordReset(validate(forgotPasswordSchema, req.body));
  res.json({ ok: true });
});

identityRouter.post("/password/reset", authRateLimiter, async (req, res) => {
  await identity.resetPassword(validate(resetPasswordSchema, req.body));
  res.status(204).end();
});
