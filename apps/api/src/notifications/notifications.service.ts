
import type { AuthContext } from "../auth/authenticate";
import { forTeam } from "../data-access";
import { NotificationType, Prisma } from "../generated/prisma/client";
import { publishToRecipient } from "../realtime/realtime.hub";
import { AppError } from "../shared/httpError";
import type { NotificationContent } from "./notifications.messages";
import { enqueue as enqueueEmailMessage, type QueuedEmailKind } from "./notifications.queue";

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

export type NotificationResult = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>;

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  /** Idempotency key: a duplicate for the same `(teamId, dedupeKey)` is treated as already-dispatched. */
  dedupeKey: string;
  content: NotificationContent;
  /** The recipient's email address — used only for the queued email side effect. */
  email: string;
}

function emailKindFor(type: NotificationType): QueuedEmailKind {
  return type === NotificationType.REMINDER ? "reminder" : "blocker_alert";
}

/**
 * Fan a notification out to the durable in-app inbox, a live SSE push, and a queued email — tenant-scoped
 * via `forTeam(teamId)`. `teamId` is taken directly (not an `AuthContext`) because Phases 5/6 dispatch
 * off-request from the scheduler, which has no caller session — only the per-team iteration produced by
 * its own `forTeam` loop (CLAUDE §3/§9).
 *
 * Idempotent: the create is keyed on `dedupeKey`; a duplicate raises Prisma P2002, caught and treated as
 * an already-dispatched no-op, so no repeat inbox row, SSE push, or email fires (CLAUDE §9). The two side
 * effects run only on a fresh create and never throw — realtime is best-effort, email is enqueued off the
 * request path — so neither can roll back or lose the durable row (Golden Rule 9).
 */
export async function notify(teamId: string, input: NotifyInput): Promise<void> {
  const db = forTeam(teamId);

  let created: NotificationResult;
  try {
    created = await db.notification.create({
      data: {
        teamId,
        userId: input.userId,
        type: input.type,
        title: input.content.title,
        body: input.content.body,
        dedupeKey: input.dedupeKey,
      },
      select: notificationSelect,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return;
    }
    throw err;
  }

  try {
    publishToRecipient(teamId, input.userId, {
      notificationId: created.id,
      type: created.type,
      title: created.title,
    });
  } catch {
    console.warn(`[notifications] live push failed team=${teamId} type=${input.type}`);
  }

  enqueueEmailMessage({
    kind: emailKindFor(input.type),
    to: input.email,
    subject: input.content.title,
    text: input.content.body,
  });
}

// ── Read API ────────────────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export interface NotificationsPage {
  items: NotificationResult[];
  nextCursor: string | null;
  unreadCount: number;
}

/**
 * The caller's own inbox, newest first, cursor-paginated over `[userId, createdAt desc]` and recipient-
 * scoped to `auth.userId` under `forTeam`. `unreadCount` is read alongside the page so a badge never needs
 * a second round trip.
 */
export async function listMyNotifications(
  auth: AuthContext,
  options: { cursor?: string; unreadOnly?: boolean },
): Promise<NotificationsPage> {
  const db = forTeam(auth.teamId);
  const where = {
    userId: auth.userId,
    ...(options.unreadOnly ? { readAt: null } : {}),
  };

  const [rows, unreadCount] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      select: notificationSelect,
    }),
    db.notification.count({ where: { userId: auth.userId, readAt: null } }),
  ]);

  const hasMore = rows.length > PAGE_SIZE;
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? last.id : null;
  return { items, nextCursor, unreadCount };
}

/** Mark one of the caller's own notifications read. Idempotent — a second call keeps the original `readAt`. */
export async function markRead(auth: AuthContext, id: string): Promise<NotificationResult> {
  const db = forTeam(auth.teamId);
  const existing = await db.notification.findFirst({
    where: { id, userId: auth.userId },
    select: notificationSelect,
  });
  if (!existing) {
    throw new AppError(404, "NOTIFICATION_NOT_FOUND", "Notification not found.");
  }
  if (existing.readAt !== null) {
    return existing;
  }
  return db.notification.update({
    where: { id },
    data: { readAt: new Date() },
    select: notificationSelect,
  });
}

/** Mark every one of the caller's own unread notifications read. Idempotent. */
export async function markAllRead(auth: AuthContext): Promise<{ count: number }> {
  const result = await forTeam(auth.teamId).notification.updateMany({
    where: { userId: auth.userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { count: result.count };
}
