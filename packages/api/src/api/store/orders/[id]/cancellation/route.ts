import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import type {
  StoreOrderCancellationInput,
  StoreOrderCancellationResponse,
} from "../../../../../lib/order-finance/contracts";
import { readOrderFinance } from "../../../../../lib/order-finance/read";
import { operateOrderFinanceWorkflow } from "../../../../../workflows/operate-order-finance";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<StoreOrderCancellationResponse>,
) {
  res.setHeader("Cache-Control", "private, no-store");
  const { view } = await readOrderFinance(req.scope, req.params.id, {
    actor_id: req.auth_context.actor_id,
    customer_id: req.auth_context.actor_id,
  });
  const { allowed, reason } = view.finance.cancellation;
  res.json({ cancellation: { allowed, reason } });
}

export async function POST(
  req: AuthenticatedMedusaRequest<StoreOrderCancellationInput>,
  res: MedusaResponse<StoreOrderCancellationResponse>,
) {
  res.setHeader("Cache-Control", "private, no-store");
  const { note, request_id, confirm } = req.validatedBody;
  const { result } = await operateOrderFinanceWorkflow(req.scope).run({
    input: {
      action: "cancel",
      note,
      request_id,
      confirm,
      order_id: req.params.id,
      actor_id: req.auth_context.actor_id,
      customer_id: req.auth_context.actor_id,
    },
  });
  if (
    !result.finance.history.some(
      (entry) =>
        entry.id === `cancel:${req.params.id}:${request_id}` &&
        entry.status === "complete",
    )
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "No pudimos confirmar la cancelación. Actualiza el pedido antes de reintentar.",
    );
  const { allowed, reason } = result.finance.cancellation;
  res.json({ cancellation: { allowed, reason }, canceled: true });
}
