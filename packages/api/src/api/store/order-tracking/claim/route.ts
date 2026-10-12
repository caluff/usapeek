import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { StoreOrderTrackingClaimInput } from "../../../../lib/order-tracking/claim-contracts";
import { claimTrackedOrderWorkflow } from "../../../../workflows/claim-tracked-order";

export async function POST(req: AuthenticatedMedusaRequest<StoreOrderTrackingClaimInput>, res: MedusaResponse) {
  const { result } = await claimTrackedOrderWorkflow(req.scope).run({ input: { token: req.validatedBody.token, auth_context: req.auth_context } });
  res.setHeader("Cache-Control", "private, no-store");
  res.json(result);
}
