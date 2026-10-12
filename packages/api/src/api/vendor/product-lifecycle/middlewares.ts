import {
  validateAndTransformBody,
  type MiddlewareRoute,
} from "@medusajs/framework/http";
import { PolicyOperation } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";

export const ProductVisibilitySchema = z.strictObject({ active: z.boolean() });
export type ProductVisibility = z.infer<typeof ProductVisibilitySchema>;
export const productLifecycleMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/vendor/product-lifecycle/:id",
    method: "GET",
    policies: [{ resource: "product", operation: PolicyOperation.read }],
    middlewares: [],
  },
  {
    matcher: "/vendor/product-lifecycle/:id/archive",
    method: "POST",
    policies: [{ resource: "product", operation: PolicyOperation.delete }],
    middlewares: [validateAndTransformBody(z.strictObject({}))],
  },
  {
    matcher: "/vendor/product-lifecycle/:id/visibility",
    method: "POST",
    policies: [{ resource: "product", operation: PolicyOperation.update }],
    middlewares: [validateAndTransformBody(ProductVisibilitySchema)],
  },
];
