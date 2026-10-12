import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { readVendorOrderCompletion } from "../../../../../lib/vendor-orders/completion";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  res.json(
    await readVendorOrderCompletion(
      req.scope,
      req.seller_context!.seller_id,
      req.params.id,
    ),
  );
}
