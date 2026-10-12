import {
  validateAndTransformBody,
  type MiddlewareRoute,
} from "@medusajs/framework/http";
import { PolicyOperation } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";

export const ProductSaleStatus = z.strictObject({
  product_id: z
    .string()
    .regex(/^prod_[a-zA-Z0-9_-]+$/)
    .max(200),
  paused: z.boolean(),
});
export type ProductSaleStatus = z.infer<typeof ProductSaleStatus>;
export const productSaleStatusMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/vendor/product-sale-status",
    method: "POST",
    policies: [{ resource: "offer", operation: PolicyOperation.update }],
    middlewares: [validateAndTransformBody(ProductSaleStatus)],
  },
];
