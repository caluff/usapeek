import {
  authenticate,
  type MiddlewareRoute,
  validateAndTransformBody,
} from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";
import { FAVORITE_PRODUCT_ID_PATTERN } from "../../../../../lib/customer-favorites";

export const StoreUpdateCustomerFavorite = z.strictObject({
  product_id: z.string().max(128).regex(FAVORITE_PRODUCT_ID_PATTERN),
  saved: z.boolean(),
});
export type StoreUpdateCustomerFavorite = z.infer<typeof StoreUpdateCustomerFavorite>;

export const favoriteMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/store/customers/me/favorites",
    method: "POST",
    middlewares: [
      authenticate("customer", ["session", "bearer"]),
      validateAndTransformBody(StoreUpdateCustomerFavorite),
    ],
  },
];
