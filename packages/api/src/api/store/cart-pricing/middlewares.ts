import type { MedusaNextFunction, MedusaRequest, MedusaResponse, MiddlewareRoute } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";

const SERVER_PRICE_FIELDS = [
  "unit_price",
  "compare_at_unit_price",
  "is_custom_price",
  "raw_unit_price",
  "raw_compare_at_unit_price",
  "is_tax_inclusive",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasClientPrice(value: unknown): boolean {
  return isRecord(value) && SERVER_PRICE_FIELDS.some(field => Object.prototype.hasOwnProperty.call(value, field));
}

function containsClientPrice(body: unknown): boolean {
  return hasClientPrice(body) || (isRecord(body) && Array.isArray(body.items) && body.items.some(hasClientPrice));
}

export function guardStoreCartPricing(req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  // Medusa strips unknown initial-item fields but preserves req.body. Mercur's
  // add schema accepts custom prices. Inspect both without replacing validators
  // or treating arbitrary metadata/additional_data as line-item input.
  if (containsClientPrice(req.body) || containsClientPrice(req.validatedBody)) {
    next(new MedusaError(MedusaError.Types.INVALID_DATA, "Store cart prices are calculated by the server."));
    return;
  }
  next();
}

export const storeCartPricingMiddlewares: MiddlewareRoute[] = [
  {
    matcher: /^\/store\/carts(?:\/[^/]+(?:\/line-items(?:\/[^/]+)?)?)?\/?$/i,
    method: "POST",
    middlewares: [guardStoreCartPricing],
  },
];
