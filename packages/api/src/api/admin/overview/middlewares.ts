import { validateAndTransformQuery, type MiddlewareRoute } from "@medusajs/framework/http";
import { PolicyOperation } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";

export const AdminOverviewOrdersQuery = z.strictObject({});
export const adminOverviewMiddlewares: MiddlewareRoute[] = [{
  matcher: "/admin/overview/orders",
  method: "GET",
  middlewares: [validateAndTransformQuery(AdminOverviewOrdersQuery, {})],
  policies: [{ resource: "order", operation: PolicyOperation.read }],
}];
