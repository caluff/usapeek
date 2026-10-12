import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { HttpTypes } from "@medusajs/framework/types";
import { cancelOrderFulfillmentWorkflow } from "@mercurjs/core/workflows/order/workflows/cancel-order-fulfillment";

export async function POST(
  req: AuthenticatedMedusaRequest<HttpTypes.AdminCancelOrderFulfillment>,
  res: MedusaResponse,
) {
  await cancelOrderFulfillmentWorkflow(req.scope).run({
    input: {
      ...req.validatedBody,
      order_id: req.params.id,
      fulfillment_id: req.params.fulfillment_id,
      canceled_by: req.auth_context.actor_id,
    },
  });
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: req.queryConfig.fields,
    filters: { id: req.params.id },
  });
  res.json({ order });
}
