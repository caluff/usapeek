import {
  authenticate,
  validateAndTransformBody,
  type MedusaRequest,
  type MedusaResponse,
  type MedusaNextFunction,
  type MiddlewareRoute,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import {
  customerReturnInputSchema,
  storeOrderCancellationInputSchema,
} from "../../../lib/order-finance/contracts";

export function denyUnscopedStoreReturn(
  _req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  next(
    new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Solicita la devolución desde tu cuenta, en el detalle de tu pedido.",
    ),
  );
}
const customer = authenticate("customer", ["session", "bearer"]);
export const orderAftersalesMiddlewares: MiddlewareRoute[] = [
  {
    matcher: /^\/store\/returns(?:\/.*)?\/?$/i,
    method: ["POST", "DELETE"],
    middlewares: [denyUnscopedStoreReturn],
  },
  {
    matcher: "/store/orders/:id/cancellation",
    method: "GET",
    middlewares: [customer],
  },
  {
    matcher: "/store/orders/:id/cancellation",
    method: "POST",
    bodyParser: { sizeLimit: "4kb" },
    middlewares: [
      customer,
      validateAndTransformBody(storeOrderCancellationInputSchema),
    ],
  },
  {
    matcher: "/store/orders/:id/returns",
    method: "GET",
    middlewares: [customer],
  },
  {
    matcher: "/store/orders/:id/returns",
    method: "POST",
    bodyParser: { sizeLimit: "16kb" },
    middlewares: [
      customer,
      validateAndTransformBody(customerReturnInputSchema),
    ],
  },
];
