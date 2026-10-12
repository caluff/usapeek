import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { issueVendorSessionWorkflow } from "../../../../workflows/vendor-session";

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { result } = await issueVendorSessionWorkflow(req.scope).run({ input: req.auth_context });
  res.setHeader("Cache-Control", "no-store");
  return res.json(result);
}
