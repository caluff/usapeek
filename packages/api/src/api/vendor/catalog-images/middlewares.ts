import { validateAndTransformBody, type MiddlewareRoute } from "@medusajs/framework/http";
import { MedusaError, PolicyOperation } from "@medusajs/framework/utils";
import { CatalogImageUploadSchema } from "../../../lib/catalog-media/validation";

export function denyUnownedVendorUploads(): never {
  throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Upload product images through /vendor/catalog-images so seller ownership and file limits are verified.");
}

export const vendorCatalogImageMiddlewares: MiddlewareRoute[] = [{
  matcher: "/vendor/catalog-images",
  method: "POST",
  bodyParser: { sizeLimit: "7mb" },
  // vendorLiveGuard authenticates and loads current membership roles first.
  // Re-authentication here would replace those roles with the stale JWT claims.
  middlewares: [validateAndTransformBody(CatalogImageUploadSchema)],
  policies: [{ resource: "file", operation: PolicyOperation.create }],
}, {
  matcher: "/vendor/uploads",
  method: "POST",
  middlewares: [denyUnownedVendorUploads],
}];
