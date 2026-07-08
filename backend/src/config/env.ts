// Environment configuration — parsed and validated once at boot (auth plan Phase 1, deliverable 2).
//
// Fails fast with a clear message if a required secret/URL is missing (Golden Rule 10: secrets stay
// in env; never logged). Importing this module has the side effect of validating process.env, so it
// is imported first from index.ts. DIRECT_URL is intentionally NOT validated here — it is a
// migration-only concern read directly by prisma.config.ts, never used by the runtime.
import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  // Neon POOLED endpoint used by the pg driver adapter at runtime (src/db/prisma.ts).
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Symmetric secrets. Access token = HS256 JWT; refresh/onboarding tokens = HMAC-SHA256 at rest.
  ACCESS_TOKEN_SECRET: z.string().min(1, "ACCESS_TOKEN_SECRET is required"),
  REFRESH_TOKEN_SECRET: z.string().min(1, "REFRESH_TOKEN_SECRET is required"),
  // Vercel frontend origin allowed by CORS.
  CORS_ORIGIN: z.string().min(1, "CORS_ORIGIN is required"),
  // Base URL used to build invite/reset links handed to the notifications seam.
  WEB_APP_URL: z.url("WEB_APP_URL must be a valid URL"),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // AI (Gemini) — read only by the insights Gemini client (src/insights/insights.gemini.ts). The key is
  // OPTIONAL on purpose: AI is never on the critical path (CLAUDE §7, architecture §11), so a missing key
  // degrades to "summary unavailable" rather than blocking boot. Model / output cap / time-box are
  // Flash-class defaults, overridable per environment.
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  GEMINI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(1024),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  // SMTP (notifications module Phase 4) — read only by src/notifications/notifications.transport.ts. All
  // OPTIONAL, mirroring GEMINI_API_KEY: unset (dev/test) degrades the email queue to log-only rather than
  // blocking boot; set (production) sends for real. The in-app inbox and SSE push work regardless.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_SECURE: z.coerce.boolean().default(false),
  // Scheduler (implementation plan Phase 5) — a short tick interval and each member's local-morning
  // reminder hour. Configuration, not a user-facing timezone picker (still never asked; captured from the
  // browser, CLAUDE §6).
  SCHEDULER_INTERVAL_MS: z.coerce.number().int().positive().default(5 * 60 * 1000),
  REMINDER_LOCAL_HOUR: z.coerce.number().int().min(0).max(23).default(9),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Report which keys are wrong — never their values (no secret leakage) — then crash.
  const issues = parsed.error.issues
    .map((issue) => `  • ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;
