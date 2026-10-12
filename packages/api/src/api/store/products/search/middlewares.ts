import {
  validateAndTransformBody,
  type MiddlewareRoute,
} from "@medusajs/framework/http";
import { StoreSearchProductsSchema } from "./validators";

export const algoliaMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/store/products/search",
    method: "POST",
    middlewares: [validateAndTransformBody(StoreSearchProductsSchema)],
  },
];
