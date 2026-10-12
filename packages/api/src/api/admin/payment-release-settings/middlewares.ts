import {
  authenticate,
  validateAndTransformBody,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
  type MiddlewareRoute,
} from "@medusajs/framework/http";
import { MedusaError, PolicyOperation } from "@medusajs/framework/utils";
import { updatePaymentReleaseSettingsSchema } from "../../../lib/order-finance/contracts";

export function protectPaymentSettingsMetadata(
  req: MedusaRequest<{ metadata?: unknown }>,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  // The native Store update replaces metadata, even when only other keys are sent.
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, "metadata")) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Los modos de cobro y liberación se cambian exclusivamente desde la configuración de Pagos; no se pueden borrar sus metadatos.",
    );
  }
  next();
}

export const paymentReleaseSettingsMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/stores/:id",
    method: "POST",
    middlewares: [protectPaymentSettingsMetadata],
  },
  {
    matcher: "/admin/payment-release-settings",
    method: "GET",
    middlewares: [authenticate("user", ["session", "bearer"])],
    policies: [{ resource: "store", operation: PolicyOperation.read }],
  },
  {
    matcher: "/admin/payment-release-settings",
    method: "POST",
    bodyParser: { sizeLimit: "4kb" },
    middlewares: [
      authenticate("user", ["session", "bearer"]),
      validateAndTransformBody(updatePaymentReleaseSettingsSchema),
    ],
    policies: [
      { resource: "store", operation: PolicyOperation.update },
      { resource: "payment", operation: PolicyOperation.update },
    ],
  },
];
