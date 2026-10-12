import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import type {
  FinanceReportingQuery,
  VendorFinanceReportingResponse,
} from "../../../../lib/order-finance/contracts";
import { readVendorFinanceReporting } from "../../../../lib/order-finance/vendor-reporting-projection";

export async function GET(
  req: AuthenticatedMedusaRequest<unknown, FinanceReportingQuery>,
  res: MedusaResponse<VendorFinanceReportingResponse>,
) {
  res.setHeader("Cache-Control", "private, no-store");
  const sellerId = req.seller_context?.seller_id ?? "";
  const report = await readVendorFinanceReporting(req.scope, {
    actor_id: req.auth_context.actor_id,
    seller_id: sellerId,
    query: req.validatedQuery,
  });
  res.json(report);
}
