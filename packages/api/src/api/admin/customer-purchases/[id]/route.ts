import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import type {
  AdminCustomerPurchasesDetailResponse,
  AdminCustomerPurchasesQuery,
} from "../../../../lib/customer-purchases/contracts";
import { readAdminCustomerPurchasesDetail } from "../../../../lib/customer-purchases/detail";

export async function GET(
  req: AuthenticatedMedusaRequest<unknown, AdminCustomerPurchasesQuery>,
  res: MedusaResponse<AdminCustomerPurchasesDetailResponse>,
) {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(
    await readAdminCustomerPurchasesDetail(
      req.scope,
      req.params.id,
      req.validatedQuery,
    ),
  );
}
