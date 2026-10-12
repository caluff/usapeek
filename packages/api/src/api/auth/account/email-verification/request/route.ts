import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { requestAccountEmailVerificationWorkflow } from "../../../../../workflows/account-email-verification";
import type { RequestAccountEmailVerificationInput, RequestAccountEmailVerificationResponse } from "../contracts";

export async function POST(req: AuthenticatedMedusaRequest<RequestAccountEmailVerificationInput>, res: MedusaResponse<RequestAccountEmailVerificationResponse>) {
  const { result } = await requestAccountEmailVerificationWorkflow(req.scope).run({ input: req.auth_context });
  res.setHeader("Cache-Control", "no-store");
  return res.json(result);
}
