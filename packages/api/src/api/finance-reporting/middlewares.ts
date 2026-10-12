import {
  validateAndTransformQuery,
  type MiddlewareRoute,
} from "@medusajs/framework/http";
import { PolicyOperation } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import {
  financeReportingQuerySchema,
  vendorEarningsQuerySchema,
  vendorSettlementsQuerySchema,
} from "../../lib/order-finance/contracts";

export const vendorSettlementsStreamQuerySchema = z.strictObject({});
export const vendorReportingStreamQuerySchema = z.strictObject({});

export const financeReportingMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/vendor/finance/earnings",
    method: "GET",
    middlewares: [validateAndTransformQuery(vendorEarningsQuerySchema, {})],
    policies: [{ resource: "order", operation: PolicyOperation.read }],
  },
  {
    matcher: "/vendor/finance/reporting/stream",
    method: "GET",
    middlewares: [
      validateAndTransformQuery(vendorReportingStreamQuerySchema, {}),
    ],
    policies: [{ resource: "order", operation: PolicyOperation.read }],
  },
  {
    matcher: "/vendor/finance/settlements/stream",
    method: "GET",
    middlewares: [
      validateAndTransformQuery(vendorSettlementsStreamQuerySchema, {}),
    ],
    policies: [{ resource: "order", operation: PolicyOperation.read }],
  },
  {
    matcher: "/vendor/finance/settlements",
    method: "GET",
    middlewares: [validateAndTransformQuery(vendorSettlementsQuerySchema, {})],
    policies: [{ resource: "order", operation: PolicyOperation.read }],
  },
  {
    matcher: "/admin/finance/reporting",
    method: "GET",
    middlewares: [validateAndTransformQuery(financeReportingQuerySchema, {})],
  },
  {
    matcher: "/vendor/finance/reporting",
    method: "GET",
    middlewares: [validateAndTransformQuery(financeReportingQuerySchema, {})],
    policies: [{ resource: "order", operation: PolicyOperation.read }],
  },
];
