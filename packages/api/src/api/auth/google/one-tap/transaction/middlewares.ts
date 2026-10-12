import { validateAndTransformBody, type MiddlewareRoute } from "@medusajs/framework/http";
import { GoogleOneTapTransactionInputSchema } from "../../../../../lib/google-one-tap/contracts";

export const googleOneTapMiddlewares: MiddlewareRoute[] = [{
  matcher: "/auth/google/one-tap/transaction",
  method: "POST",
  middlewares: [validateAndTransformBody(GoogleOneTapTransactionInputSchema)],
}];
