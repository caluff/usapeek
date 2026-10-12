import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { getAccountEmailVerification } from "../../../../lib/account-email-verification";
import type { AccountEmailVerificationResponse } from "./contracts";

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse<AccountEmailVerificationResponse>) {
  const result = await getAccountEmailVerification(req.scope, req.auth_context);
  res.setHeader("Cache-Control", "no-store");
  return res.json(result);
}
