
import { env } from "./config/env";
import cors from "cors";
import express from "express";
import morgan from "morgan";
import { dashboardRouter } from "./dashboard/dashboard.routes";
import { prisma } from "./db/prisma";
import { historyRouter } from "./history/history.routes";
import { identityRouter } from "./identity/identity.routes";
import { insightsRouter } from "./insights/insights.routes";
import { notificationsRouter } from "./notifications/notifications.routes";
import { startScheduler, stopScheduler } from "./notifications/notifications.scheduler";
import { realtimeRouter } from "./realtime/realtime.routes";
import { errorHandler } from "./shared/httpError";
import { standupsRouter } from "./standups/standups.routes";
import { teamsRouter } from "./teams/teams.routes";

const app = express();

app.set("trust proxy", 1);

app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(morgan("dev"));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", identityRouter);
app.use("/teams", teamsRouter);
app.use("/standups", standupsRouter);
app.use("/insights", insightsRouter);
app.use("/dashboard", dashboardRouter);
app.use("/history", historyRouter);
app.use("/realtime", realtimeRouter);
app.use("/notifications", notificationsRouter);

app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});

// Singleton reminder/blocker-alert loop (implementation plan Phase 5/6) — never inside a request handler.
startScheduler();

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down`);
  stopScheduler();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
