// Notifications & Scheduling seam (auth plan Phase 3, deliverable 1; CLAUDE §9).
//
// Auth builds an invite/reset link and hands it off exactly once through this interface. The contract —
// signature and types — is unchanged from the original dev-safe stub, so identity.service.ts needed no
// changes when this was wired to real delivery (implementation plan Phase 4): content is built from the
// link via notifications.messages, then handed to the queued, backoff-retried, off-request-path SMTP
// worker (notifications.queue). Enqueue returns fast, never throws synchronously, and never blocks the
// caller — email stays off the request path (CLAUDE §9).
import { buildInviteEmail, buildPasswordResetEmail } from "./notifications.messages";
import { enqueue } from "./notifications.queue";

export type EmailKind = "invite" | "password_reset";

export interface EmailPayload {
  /** Fully-built link carrying the raw single-use token. Handed to delivery; never logged. */
  url: string;
}

export async function enqueueEmail(kind: EmailKind, to: string, payload: EmailPayload): Promise<void> {
  const content = kind === "invite" ? buildInviteEmail(payload.url) : buildPasswordResetEmail(payload.url);
  enqueue({ kind, to, subject: content.title, text: content.body });
}
