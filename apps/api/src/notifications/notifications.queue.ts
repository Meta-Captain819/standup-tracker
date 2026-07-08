
import { env } from "../config/env";
import { getTransport } from "./notifications.transport";

export type QueuedEmailKind = "invite" | "password_reset" | "reminder" | "blocker_alert";

export interface QueuedEmail {
  /** For safe, PII-free failure logging only — never the recipient, subject, or body. */
  kind: QueuedEmailKind;
  to: string;
  subject: string;
  text: string;
}

const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 300;
const SEND_TIMEOUT_MS = 8000;

const queue: QueuedEmail[] = [];
let draining = false;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransient(err: unknown): boolean {
  const code = (err as { responseCode?: unknown } | undefined)?.responseCode;
  if (typeof code === "number") {
    return code === 421 || code === 450 || code === 451 || code === 452;
  }
  return true;
}

async function sendOnce(transport: NonNullable<ReturnType<typeof getTransport>>, message: QueuedEmail): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      transport.sendMail({
        from: env.SMTP_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
      }),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("smtp send timed out")), SEND_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function sendWithRetry(message: QueuedEmail): Promise<void> {
  const transport = getTransport();
  if (!transport) {
    if (env.NODE_ENV !== "production") {
      console.log(`[notifications] queued ${message.kind} email (SMTP not configured)`);
    }
    return;
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      await sendOnce(transport, message);
      return;
    } catch (err) {
      if (attempt === MAX_ATTEMPTS - 1 || !isTransient(err)) {
        console.error(`[notifications] email delivery failed kind=${message.kind}`);
        return;
      }
      await delay(BACKOFF_BASE_MS * 2 ** attempt);
    }
  }
}

async function drain(): Promise<void> {
  if (draining) {
    return;
  }
  draining = true;
  try {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      await sendWithRetry(next);
    }
  } finally {
    draining = false;
  }
}

/** Enqueue an email for off-request-path delivery. Never throws, never blocks the caller. */
export function enqueue(message: QueuedEmail): void {
  queue.push(message);
  void drain();
}
