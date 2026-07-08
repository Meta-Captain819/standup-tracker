
import type { NotificationType, Role } from "../generated/prisma/client";

export interface EventSink {
  write(chunk: string): void;
}

export interface Connection {
  readonly teamId: string;
  readonly userId: string;
  readonly role: Role;
  readonly sink: EventSink;
}

export const BOARD_EVENT = "board-update";

export interface BoardEvent {
  userId: string;
  localStandupDate: Date;
}

const connections = new Set<Connection>();

/** Register a live connection. Returns the handle to pass to `unregister` when the stream closes. */
export function register(sink: EventSink, context: {
  teamId: string;
  userId: string;
  role: Role;
}): Connection {
  const connection: Connection = { ...context, sink };
  connections.add(connection);
  return connection;
}

/** Drop a connection from the registry (on stream close). Idempotent. */
export function unregister(connection: Connection): void {
  connections.delete(connection);
}

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Best-effort write: a dead socket throws, so the connection is dropped rather than letting a broken write
// recur or bubble up. Never throws.
function deliver(connection: Connection, event: string, data: unknown): void {
  try {
    connection.sink.write(frame(event, data));
  } catch {
    connections.delete(connection);
  }
}

function isLeadOrAdmin(role: Role): boolean {
  return role === "LEAD" || role === "OWNER_ADMIN";
}

/**
 * Publish a board-freshness event to a team's LEAD/OWNER_ADMIN connections only — a member never receives
 * other members' board activity (workflow: a member sees only their own updates). Confined to the given
 * team's partition. Best-effort and non-throwing, so a realtime failure can never break the caller.
 */
export function publishBoardEvent(teamId: string, event: BoardEvent): void {
  for (const connection of connections) {
    if (connection.teamId === teamId && isLeadOrAdmin(connection.role)) {
      deliver(connection, BOARD_EVENT, event);
    }
  }
}

// The recipient-addressed event name and its minimal payload: enough for a connected client to show a
// live toast/badge; the durable inbox (Phase 4) is the authoritative full record regardless.
export const NOTIFICATION_EVENT = "notification";

export interface RecipientNotificationEvent {
  notificationId: string;
  type: NotificationType;
  title: string;
}

/**
 * Publish a notification to one recipient's own live connections only (implementation plan Phase 4/6) —
 * the live channel for in-app notifications. Confined to the given team's partition and further filtered
 * to the one recipient. Best-effort and non-throwing, so a realtime failure can never lose the durable
 * inbox row that already backs it (Golden Rule 9).
 */
export function publishToRecipient(
  teamId: string,
  userId: string,
  event: RecipientNotificationEvent,
): void {
  for (const connection of connections) {
    if (connection.teamId === teamId && connection.userId === userId) {
      deliver(connection, NOTIFICATION_EVENT, event);
    }
  }
}

/** Write an SSE heartbeat comment to keep an idle connection (and intermediaries) alive. Non-throwing. */
export function sendHeartbeat(connection: Connection): void {
  try {
    connection.sink.write(": heartbeat\n\n");
  } catch {
    connections.delete(connection);
  }
}
