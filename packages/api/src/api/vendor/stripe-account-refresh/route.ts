import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import type { PayoutAccountDTO } from "@mercurjs/types";
import { refreshVendorStripeAccountWorkflow } from "../../../workflows/refresh-vendor-stripe-account";
import type { VendorStripeAccountRefresh } from "./validators";

export async function POST(
  req: AuthenticatedMedusaRequest<VendorStripeAccountRefresh>,
  res: MedusaResponse<
    | { payout_account: Pick<PayoutAccountDTO, "id" | "status"> }
    | { message: string }
  >,
) {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const { result } = await refreshVendorStripeAccountWorkflow(req.scope).run({
      input: {
        member_id: req.auth_context.actor_id,
        auth_identity_id: req.auth_context.auth_identity_id,
        seller_id: req.seller_context?.seller_id || "",
      },
    });
    res.json({ payout_account: result });
  } catch (error) {
    const type =
      error && typeof error === "object" && "type" in error
        ? error.type
        : undefined;
    const status =
      type === MedusaError.Types.NOT_ALLOWED
        ? 403
        : type === MedusaError.Types.NOT_FOUND
          ? 404
          : 503;
    res.status(status).json({
      message:
        status === 403
          ? "Stripe account access is not available."
          : "Stripe account verification could not be completed.",
    });
  }
}
