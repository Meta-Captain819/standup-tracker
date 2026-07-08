
import { Router } from "express";
import { authenticate } from "../auth/authenticate";
import { validate } from "../shared/validate";
import { listNotificationsQuerySchema, notificationIdParamsSchema } from "./notifications.schemas";
import * as notifications from "./notifications.service";

export const notificationsRouter = Router();

notificationsRouter.get("/", authenticate, async (req, res) => {
  const { cursor, unread } = validate(listNotificationsQuerySchema, req.query);
  const result = await notifications.listMyNotifications(req.auth!, { cursor, unreadOnly: unread });
  res.json(result);
});

notificationsRouter.post("/:id/read", authenticate, async (req, res) => {
  const { id } = validate(notificationIdParamsSchema, req.params);
  const result = await notifications.markRead(req.auth!, id);
  res.json(result);
});

notificationsRouter.post("/read-all", authenticate, async (req, res) => {
  const result = await notifications.markAllRead(req.auth!);
  res.json(result);
});
