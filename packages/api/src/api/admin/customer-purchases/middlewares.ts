import {
  validateAndTransformQuery,
  type MiddlewareRoute,
} from "@medusajs/framework/http";
import { PolicyOperation } from "@medusajs/framework/utils";
import { AdminCustomerPurchasesQuerySchema } from "../../../lib/customer-purchases/contracts";

export const adminCustomerPurchasesMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/customer-purchases",
    method: "GET",
    middlewares: [
      validateAndTransformQuery(AdminCustomerPurchasesQuerySchema, {}),
    ],
    policies: [
      { resource: "customer", operation: PolicyOperation.read },
      { resource: "order_group", operation: PolicyOperation.read },
      { resource: "order", operation: PolicyOperation.read },
    ],
  },
  {
    matcher: "/admin/customer-purchases/:id",
    method: "GET",
    middlewares: [
      validateAndTransformQuery(AdminCustomerPurchasesQuerySchema, {}),
    ],
    policies: [
      { resource: "customer", operation: PolicyOperation.read },
      { resource: "order_group", operation: PolicyOperation.read },
      { resource: "order", operation: PolicyOperation.read },
    ],
  },
];
