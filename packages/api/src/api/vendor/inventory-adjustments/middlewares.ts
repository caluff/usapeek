import { validateAndTransformBody, type MiddlewareRoute } from "@medusajs/framework/http";
import { PolicyOperation } from "@medusajs/framework/utils";
import { vendorInventoryAdjustmentSchema } from "../../../lib/inventory/validation";

export const vendorInventoryMiddlewares: MiddlewareRoute[] = [{
  matcher: "/vendor/inventory-adjustments",
  method: "POST",
  bodyParser: { sizeLimit: "4kb" },
  middlewares: [validateAndTransformBody(vendorInventoryAdjustmentSchema)],
  policies: [{ resource: "inventory_item", operation: PolicyOperation.update }],
}];
