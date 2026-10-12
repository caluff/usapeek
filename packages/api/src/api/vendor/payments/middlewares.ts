import type {
  MedusaRequest,
  MedusaResponse,
  MiddlewareRoute,
} from "@medusajs/framework/http";

export function rejectVendorPaymentCapture(
  _req: MedusaRequest,
  res: MedusaResponse,
) {
  // A seller owns its split, not the cart's shared payment or capture timing.
  res.status(403).json({
    type: "not_allowed",
    message:
      "La captura del pago compartido corresponde a la plataforma, no al vendedor.",
  });
}

export const vendorPaymentProtectionMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/vendor/payments/:id/capture",
    method: "POST",
    middlewares: [rejectVendorPaymentCapture],
  },
];
