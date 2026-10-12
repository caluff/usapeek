import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { confirmAccountEmailVerificationWorkflow } from "../../../../../workflows/account-email-verification";
import type { AccountEmailVerificationResponse, ConfirmAccountEmailVerificationInput } from "../contracts";

export async function POST(req: AuthenticatedMedusaRequest<ConfirmAccountEmailVerificationInput>, res: MedusaResponse<AccountEmailVerificationResponse>) {
  const { result } = await confirmAccountEmailVerificationWorkflow(req.scope).run({ input: { auth_context: req.auth_context, code: req.validatedBody.code } });
  res.setHeader("Cache-Control", "no-store");
  return res.json(result);
}
