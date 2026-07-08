
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
