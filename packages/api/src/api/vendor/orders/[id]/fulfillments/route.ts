import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import type { VendorCreateFulfillmentType } from "@mercurjs/core/api/vendor/orders/validators";
import { createVendorOrderFulfillmentWorkflow } from "../../../../../workflows/create-vendor-order-fulfillment";

export async function POST(
  req: AuthenticatedMedusaRequest<VendorCreateFulfillmentType>,
  res: MedusaResponse,
) {
  const { result: fulfillment } = await createVendorOrderFulfillmentWorkflow(
    req.scope,
  ).run({
    input: {
      ...req.validatedBody,
      order_id: req.params.id,
      seller_id: req.seller_context!.seller_id,
    },
  });
  res.json({ fulfillment });
}
