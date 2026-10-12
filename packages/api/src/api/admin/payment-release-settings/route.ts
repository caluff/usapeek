import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import type {
  PaymentReleaseSettingsResponse,
  UpdatePaymentReleaseSettings,
} from "../../../lib/order-finance/contracts";
import {
  publicPaymentReleaseSettings,
  readPaymentReleaseSettings,
} from "../../../lib/order-finance/release-settings";
import { updatePaymentReleaseSettingsWorkflow } from "../../../workflows/update-payment-release-settings";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<PaymentReleaseSettingsResponse>,
) {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(
    publicPaymentReleaseSettings(await readPaymentReleaseSettings(req.scope)),
  );
}

export async function POST(
  req: AuthenticatedMedusaRequest<UpdatePaymentReleaseSettings>,
  res: MedusaResponse<PaymentReleaseSettingsResponse>,
) {
  const { result } = await updatePaymentReleaseSettingsWorkflow(req.scope).run({
    input: { ...req.validatedBody, actor_id: req.auth_context.actor_id },
  });
  res.setHeader("Cache-Control", "private, no-store");
  res.json(result);
}
