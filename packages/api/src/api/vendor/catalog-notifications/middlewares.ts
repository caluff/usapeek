import {
  validateAndTransformQuery,
  type MiddlewareRoute,
} from "@medusajs/framework/http";
import { PolicyOperation } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";

export const VendorCatalogStreamQuery = z.strictObject({});
export type VendorCatalogStreamQuery = z.infer<typeof VendorCatalogStreamQuery>;

export const vendorCatalogNotificationsMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/vendor/catalog-notifications/stream",
    method: "GET",
    middlewares: [validateAndTransformQuery(VendorCatalogStreamQuery, {})],
    policies: [{ resource: "product", operation: PolicyOperation.read }],
  },
];
