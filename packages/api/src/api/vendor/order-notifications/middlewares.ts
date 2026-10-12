import {
  validateAndTransformQuery,
  type MiddlewareRoute,
} from "@medusajs/framework/http";
import { PolicyOperation } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";

export const VendorOrderNotificationsQuery = z.strictObject({
  fresh: z.literal("1").optional(),
});
export type VendorOrderNotificationsQuery = z.infer<
  typeof VendorOrderNotificationsQuery
>;

export const vendorOrderNotificationsMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/vendor/order-notifications/stream",
    method: "GET",
    middlewares: [validateAndTransformQuery(z.strictObject({}), {})],
    policies: [{ resource: "order", operation: PolicyOperation.read }],
  },
  {
    matcher: "/vendor/order-notifications",
    method: "GET",
    middlewares: [validateAndTransformQuery(VendorOrderNotificationsQuery, {})],
    policies: [{ resource: "order", operation: PolicyOperation.read }],
  },
];
