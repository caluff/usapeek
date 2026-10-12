import {
  validateAndTransformQuery,
  type MiddlewareRoute,
} from "@medusajs/framework/http";
import { PolicyOperation } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";

export const VendorWarehouseQuery = z.strictObject({});
export type VendorWarehouseQuery = z.infer<typeof VendorWarehouseQuery>;

export const vendorWarehouseMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/vendor/warehouse",
    method: "GET",
    middlewares: [validateAndTransformQuery(VendorWarehouseQuery, {})],
    policies: [{ resource: "stock_location", operation: PolicyOperation.read }],
  },
];
