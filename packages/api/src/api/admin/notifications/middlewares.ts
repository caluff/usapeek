import {
  validateAndTransformQuery,
  type MiddlewareRoute,
} from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";

export const AdminNotificationsQuery = z.strictObject({
  fresh: z.literal("1").optional(),
});
export type AdminNotificationsQuery = z.infer<typeof AdminNotificationsQuery>;
export const adminNotificationsMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/notifications",
    method: "GET",
    middlewares: [validateAndTransformQuery(AdminNotificationsQuery, {})],
  },
  {
    matcher: "/admin/notifications/stream",
    method: "GET",
    middlewares: [validateAndTransformQuery(z.strictObject({}), {})],
    // Each topic resolves its own native authority; requiring all resources
    // together would lock members with partial roles out of permitted topics.
  },
];
