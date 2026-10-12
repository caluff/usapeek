import {
  validateAndTransformBody,
  type MiddlewareRoute,
} from "@medusajs/framework/http";
import { PolicyOperation } from "@medusajs/framework/utils";
import { UpdateVendorOfferPrice } from "./validators";

export const vendorOfferPriceMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/vendor/offers/:id/price",
    method: "POST",
    bodyParser: { sizeLimit: "8kb" },
    middlewares: [validateAndTransformBody(UpdateVendorOfferPrice)],
    policies: [{ resource: "offer", operation: PolicyOperation.update }],
  },
];
