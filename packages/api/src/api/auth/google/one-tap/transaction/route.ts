import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { GoogleOneTapTransactionInput, GoogleOneTapTransactionResponse } from "../../../../../lib/google-one-tap/contracts";
import { createGoogleOneTapTransactionWorkflow } from "../../../../../workflows/create-google-one-tap-transaction";

export async function POST(req: MedusaRequest<GoogleOneTapTransactionInput>, res: MedusaResponse<GoogleOneTapTransactionResponse>) {
  const { result } = await createGoogleOneTapTransactionWorkflow(req.scope).run({ input: req.validatedBody });
  res.setHeader("Cache-Control", "private, no-store");
  return res.json(result);
}
