import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { consumeVendorSessionWorkflow } from "../../../../workflows/vendor-session";
import type { ConsumeVendorSessionInput } from "../validators";

export async function POST(req: MedusaRequest<ConsumeVendorSessionInput>, res: MedusaResponse) {
  const { result } = await consumeVendorSessionWorkflow(req.scope).run({ input: req.validatedBody });
  res.setHeader("Cache-Control", "no-store");
  return res.json(result);
}
