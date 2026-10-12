import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import type {
  CustomerReturnInput,
  CustomerReturnsResponse,
} from "../../../../../lib/order-finance/contracts";
import { readCustomerReturns } from "../../../../../lib/order-finance/returns";
import { requestCustomerReturnWorkflow } from "../../../../../workflows/request-customer-return";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<CustomerReturnsResponse>,
) {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(
    await readCustomerReturns(
      req.scope,
      req.params.id,
      req.auth_context.actor_id,
    ),
  );
}
export async function POST(
  req: AuthenticatedMedusaRequest<CustomerReturnInput>,
  res: MedusaResponse<CustomerReturnsResponse>,
) {
  const { result } = await requestCustomerReturnWorkflow(req.scope).run({
    input: {
      ...req.validatedBody,
      order_id: req.params.id,
      customer_id: req.auth_context.actor_id,
    },
  });
  res.setHeader("Cache-Control", "private, no-store");
  res.json(result);
}
