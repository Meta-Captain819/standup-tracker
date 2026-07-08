// nodemailer transport, built once from env (implementation plan Phase 4). SMTP config is OPTIONAL,
// mirroring the Gemini client (insights.gemini.ts): unset config yields no transport, and the queue
// degrades to log-only rather than blocking boot (CLAUDE §9, architecture §12).
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env";

let transport: Transporter | null | undefined;

/** The configured nodemailer transport, or null when SMTP is not fully configured. Built once, lazily. */
export function getTransport(): Transporter | null {
  if (transport !== undefined) {
    return transport;
  }
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD || !env.SMTP_FROM) {
    transport = null;
    return transport;
  }
  transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });
  return transport;
}
