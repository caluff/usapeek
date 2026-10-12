import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { deliverVendorOrderWorkflow } from "../../../../../../../workflows/deliver-vendor-order";

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  await deliverVendorOrderWorkflow(req.scope).run({
    input: {
      order_id: req.params.id,
      seller_id: req.seller_context!.seller_id,
      fulfillment_id: req.params.fulfillment_id,
    },
  });
  const {
    data: [order],
  } = await req.scope
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "order",
      fields: req.queryConfig.fields,
      filters: { id: req.params.id },
    });
  res.json({ order });
}
