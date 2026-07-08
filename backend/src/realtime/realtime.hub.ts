// Realtime hub — the in-process registry of live SSE connections and the board-freshness publish path
// (implementation plan Phase 3; architecture §9, CLAUDE §9). One-way Server-Sent Events from Express; no
// WebSockets, no broker, no Redis. Every connection is tagged with `{ teamId, userId, role }`, and every
// publish is strictly confined to a team partition — a client can NEVER receive another team's events
// (Golden Rule 2, enforced here in the transport).
//
// Known baseline limitation (documented, not solved with infra): the registry is per-process, so an event
// published on one instance does not reach a client connected to another. Acceptable in the baseline — the
// client's short-interval revalidation fallback keeps the board eventually correct (frontend, out of scope);
// Redis pub/sub is the sanctioned, explicitly-deferred upgrade (CLAUDE §9, architecture §9/§10).
import type { NotificationType, Role } from "../generated/prisma/client";

// The minimal write target a connection needs. An Express `Response` satisfies it structurally, so the hub
// stays testable with a plain fake sink and never imports Express.
export interface EventSink {
  write(chunk: string): void;
}

export interface Connection {
  readonly teamId: string;
  readonly userId: string;
  readonly role: Role;
  readonly sink: EventSink;
}

// The board-freshness event name (SSE `event:` field) and its minimal payload: enough for a lead's board
// to know an update landed and revalidate through the Phase 1 read model — no full update crosses the wire.
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

// Serialize one SSE frame. `data` is JSON so structured payloads survive the text stream intact.
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
