// Rate limiting for auth endpoints (auth plan Phase 1, deliverable 10; CLAUDE §5, architecture §14).
//
// Applied to credential/token endpoints (signup, login, refresh, invite accept, password flows) — not
// to session checks like /auth/me. On limit it forwards an AppError to the terminal error handler so
// the 429 response shape matches every other error. Relies on `trust proxy` (set in index.ts) for a
// correct client IP behind Render's proxy.
import { rateLimit } from "express-rate-limit";
import { AppError } from "../shared/httpError";

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError(429, "RATE_LIMITED", "Too many requests. Please try again shortly."));
  },
});

// Rate limiting for the expensive, cost-bearing AI endpoints (AI module plan Phase 6; CLAUDE §8/§14).
// Keyed per client IP and shared across the insights get/refresh routes so a burst of summary requests
// can't run up Gemini cost. Mounted after `authenticate`, so only authenticated lead/admin calls count.
export const aiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError(429, "RATE_LIMITED", "Too many requests. Please try again shortly."));
  },
});
