import {
  type MiddlewareRoute,
  validateAndTransformBody,
} from "@medusajs/framework/http";
import {
  StoreCreateUsCustomer,
  StoreCreateUsCustomerAddress,
  StoreUpdateUsCustomer,
  StoreUpdateUsCustomerAddress,
} from "./validators";

export const customerAccountMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/store/customers",
    method: "POST",
    middlewares: [validateAndTransformBody(StoreCreateUsCustomer)],
  },
  {
    matcher: "/store/customers/me",
    method: "POST",
    middlewares: [validateAndTransformBody(StoreUpdateUsCustomer)],
  },
  {
    matcher: "/store/customers/me/addresses",
    method: "POST",
    middlewares: [validateAndTransformBody(StoreCreateUsCustomerAddress)],
  },
  {
    matcher: "/store/customers/me/addresses/:address_id",
    method: "POST",
    middlewares: [validateAndTransformBody(StoreUpdateUsCustomerAddress)],
  },
];
