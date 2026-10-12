import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { completeGoogleAuthWorkflow } from "../../../../workflows/complete-google-auth";
import type { CompleteGoogleAuthInput } from "./validators";

export async function POST(req: AuthenticatedMedusaRequest<CompleteGoogleAuthInput>, res: MedusaResponse) {
  const { result } = await completeGoogleAuthWorkflow(req.scope).run({
    input: { ...req.validatedBody, auth_context: req.auth_context },
  });
  res.setHeader("Cache-Control", "no-store");
  return res.json(result);
}
