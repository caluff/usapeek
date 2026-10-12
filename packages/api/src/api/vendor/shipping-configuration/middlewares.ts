import {
  validateAndTransformBody,
  wrapWithPoliciesCheck,
  type MiddlewareRoute,
  type MedusaRequest,
  type MedusaResponse,
  type MedusaNextFunction,
} from "@medusajs/framework/http";
import { PolicyOperation } from "@medusajs/framework/utils";
import { VendorShippingConfiguration } from "./validators";

export const vendorShippingConfigurationMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/vendor/shipping-configuration",
    method: "POST",
    bodyParser: { sizeLimit: "8kb" },
    middlewares: [
      validateAndTransformBody(VendorShippingConfiguration),
      (
        req: MedusaRequest<VendorShippingConfiguration>,
        res: MedusaResponse,
        next: MedusaNextFunction,
      ) =>
        wrapWithPoliciesCheck(
          (_req, _res, done) => done(),
          shippingPolicy(req.validatedBody),
        )(req, res, next),
    ],
  },
];

export function shippingPolicy(configuration: VendorShippingConfiguration) {
  return {
    resource:
      configuration.action.endsWith("profile") ||
      configuration.action === "set_profile_archived"
        ? "shipping_profile"
        : "shipping_option",
    operation: configuration.action.startsWith("create")
      ? PolicyOperation.create
      : PolicyOperation.update,
  };
}
