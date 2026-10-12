import {
  validateAndTransformBody,
  type MiddlewareRoute,
} from "@medusajs/framework/http";
import { PolicyOperation } from "@medusajs/framework/utils";
import { VendorStripeAccountRefresh } from "./validators";

export const vendorStripeAccountRefreshMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/vendor/stripe-account-refresh",
    method: "POST",
    bodyParser: { sizeLimit: "1kb" },
    middlewares: [validateAndTransformBody(VendorStripeAccountRefresh)],
    policies: [
      { resource: "payout_account", operation: PolicyOperation.update },
    ],
  },
];
