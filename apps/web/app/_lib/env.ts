import "server-only";
import { z } from "zod";

const envSchema = z.object({
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters."),
  BACKEND_API_URL: z.string().trim().min(1),
});

const parsed = envSchema.safeParse({
  SESSION_SECRET: process.env.SESSION_SECRET,
  BACKEND_API_URL: process.env.BACKEND_API_URL,
});

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

export const env = parsed.data;
