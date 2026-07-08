
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

export const aiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError(429, "RATE_LIMITED", "Too many requests. Please try again shortly."));
  },
});
