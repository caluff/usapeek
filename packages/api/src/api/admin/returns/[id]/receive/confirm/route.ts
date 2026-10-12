import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { confirmReturnReceiveWorkflow } from "@mercurjs/core/workflows/order/workflows/confirm-return-receive";

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await confirmReturnReceiveWorkflow(req.scope).run({
    input: {
      return_id: req.params.id,
      confirmed_by: req.auth_context.actor_id,
    },
  });
  const {
    data: [orderReturn],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "return",
    fields: req.queryConfig.fields,
    filters: { ...req.filterableFields, id: req.params.id },
  });
  res.json({ order_preview: result, return: orderReturn });
}
