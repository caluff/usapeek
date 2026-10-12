import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { completeVendorOrderWorkflow } from "../../../../../workflows/complete-vendor-order";

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  await completeVendorOrderWorkflow(req.scope).run({
    input: {
      order_id: req.params.id,
      seller_id: req.seller_context!.seller_id,
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
