import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import type {
  OrderFinanceInput,
  OrderFinanceResponse,
} from "../../../../../lib/order-finance/contracts";
import { readOrderFinance } from "../../../../../lib/order-finance/read";
import { operateOrderFinanceWorkflow } from "../../../../../workflows/operate-order-finance";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<OrderFinanceResponse>,
) {
  res.setHeader("Cache-Control", "private, no-store");
  const { view } = await readOrderFinance(req.scope, req.params.id, {
    actor_id: req.auth_context.actor_id,
  });
  res.json(view);
}

export async function POST(
  req: AuthenticatedMedusaRequest<OrderFinanceInput>,
  res: MedusaResponse<OrderFinanceResponse>,
) {
  const { result } = await operateOrderFinanceWorkflow(req.scope).run({
    input: {
      ...req.validatedBody,
      order_id: req.params.id,
      actor_id: req.auth_context.actor_id,
    },
  });
  res.json(result);
}
