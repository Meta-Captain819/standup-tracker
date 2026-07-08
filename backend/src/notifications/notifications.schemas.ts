// Notifications request schemas — the single source of shape for the inbox read surface (implementation
// plan Phase 4; Golden Rule 4, CLAUDE §7). Types are inferred from these schemas; both service and routes
// consume them.
import { z } from "zod";

// The caller's inbox is cursor-paginated (architecture §15) with an optional unread-only filter. The
// query string arrives as a literal "true"/"false" (or is omitted); mapped to a real boolean here rather
// than via z.coerce.boolean(), which would treat the string "false" as truthy.
export const listNotificationsQuerySchema = z.object({
  cursor: z.cuid().optional(),
  unread: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

// The `:id` route param. cuid matches the id format Prisma mints; a malformed id is rejected at the
// boundary, while a well-formed but cross-recipient id falls through to a scoped not-found via `forTeam`
// plus the recipient-scoped `where`.
export const notificationIdParamsSchema = z.object({ id: z.cuid() });
export type NotificationIdParams = z.infer<typeof notificationIdParamsSchema>;
