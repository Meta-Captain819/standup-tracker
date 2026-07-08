
import { Router } from "express";
import { authenticate } from "../auth/authenticate";
import * as hub from "./realtime.hub";

export const realtimeRouter = Router();

const HEARTBEAT_MS = 25_000;
const RETRY_MS = 5_000;

realtimeRouter.get("/stream", authenticate, (req, res) => {
  const auth = req.auth!;

  res.status(200).set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

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
