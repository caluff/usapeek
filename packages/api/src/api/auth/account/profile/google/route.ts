import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { GooglePanelProfileResponse } from "../../../google/complete/contracts";
import { fillGooglePanelProfileWorkflow } from "../../../../../workflows/fill-google-panel-profile";

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse<GooglePanelProfileResponse>) {
  const { result } = await fillGooglePanelProfileWorkflow(req.scope).run({ input: req.auth_context });
  res.setHeader("Cache-Control", "no-store");
  return res.json(result);
}
