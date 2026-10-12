import type { MedusaStoreRequest, MedusaResponse } from "@medusajs/framework/http";
import type { StoreOrderTrackingInput, StoreOrderTrackingResponse } from "../../../lib/order-tracking/contracts";
import { readOrderTracking } from "../../../lib/order-tracking/read";

export async function POST(req: MedusaStoreRequest<StoreOrderTrackingInput>, res: MedusaResponse<StoreOrderTrackingResponse>) {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await readOrderTracking(req.scope, req.validatedBody.token));
}
