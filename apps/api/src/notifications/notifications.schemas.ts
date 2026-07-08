
import { z } from "zod";

export const listNotificationsQuerySchema = z.object({
  cursor: z.cuid().optional(),
  unread: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const notificationIdParamsSchema = z.object({ id: z.cuid() });
export type NotificationIdParams = z.infer<typeof notificationIdParamsSchema>;
