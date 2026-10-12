import {
  authenticate,
  validateAndTransformBody,
  type MiddlewareRoute,
} from "@medusajs/framework/http";
import { PolicyOperation } from "@medusajs/framework/utils";
import { updatePaymentCaptureSettingsSchema } from "../../../lib/order-finance/contracts";

export const paymentCaptureSettingsMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/payment-capture-settings",
    method: "GET",
    middlewares: [authenticate("user", ["session", "bearer"])],
    policies: [{ resource: "store", operation: PolicyOperation.read }],
  },
  {
    matcher: "/admin/payment-capture-settings",
    method: "POST",
    bodyParser: { sizeLimit: "4kb" },
    middlewares: [
      authenticate("user", ["session", "bearer"]),
      validateAndTransformBody(updatePaymentCaptureSettingsSchema),
    ],
    policies: [
      { resource: "store", operation: PolicyOperation.update },
      { resource: "payment", operation: PolicyOperation.update },
    ],
  },
];
