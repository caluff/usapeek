import {
  validateAndTransformQuery,
  type MiddlewareRoute,
} from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";

export const VendorNotificationsStreamQuery = z.strictObject({});
export type VendorNotificationsStreamQuery = z.infer<
  typeof VendorNotificationsStreamQuery
>;

export const vendorNotificationsMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/vendor/notifications/stream",
    method: "GET",
    middlewares: [validateAndTransformQuery(VendorNotificationsStreamQuery, {})],
    // The route resolves native permissions per topic. A policies array would
    // require both order and product access, excluding partial member roles.
  },
];
