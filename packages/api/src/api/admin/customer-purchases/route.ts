import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import type {
  AdminCustomerPurchasesQuery,
  AdminCustomerPurchasesResponse,
} from "../../../lib/customer-purchases/contracts";
import { readAdminCustomerPurchases } from "../../../lib/customer-purchases/read";

export async function GET(
  req: AuthenticatedMedusaRequest<unknown, AdminCustomerPurchasesQuery>,
  res: MedusaResponse<AdminCustomerPurchasesResponse>,
) {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await readAdminCustomerPurchases(req.scope, req.validatedQuery));
}
