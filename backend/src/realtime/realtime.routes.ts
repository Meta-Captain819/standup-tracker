// /realtime SSE endpoint (implementation plan Phase 3). `authenticate` only — any active user may hold a
// stream; board events are filtered to leads/admins inside the hub, so opening the stream leaks nothing.
// This is a long-lived response: the handler sets the event-stream headers, registers the connection, and
// keeps it open until the client disconnects, cleaning up on close.
import { Router } from "express";
import { authenticate } from "../auth/authenticate";
import * as hub from "./realtime.hub";

export const realtimeRouter = Router();

// Heartbeat well under the typical 30–60s proxy idle timeout so the connection (and any intermediary) stays
// open; reconnect hint the browser's EventSource honors after a drop.
const HEARTBEAT_MS = 25_000;
const RETRY_MS = 5_000;

realtimeRouter.get("/stream", authenticate, (req, res) => {
  const auth = req.auth!;

  res.status(200).set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Disable proxy buffering (Render/nginx) so events flush immediately rather than being held.
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  // Reconnect hint + an opening comment to establish the stream before any event arrives.
  res.write(`retry: ${RETRY_MS}\n`);
  res.write(": connected\n\n");

  const connection = hub.register(res, {
    teamId: auth.teamId,
    userId: auth.userId,
    role: auth.role,
  });

  const heartbeat = setInterval(() => hub.sendHeartbeat(connection), HEARTBEAT_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    hub.unregister(connection);
  });
});
