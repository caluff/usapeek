import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import type {
  PaymentCaptureSettingsResponse,
  UpdatePaymentCaptureSettings,
} from "../../../lib/order-finance/contracts";
import {
  publicPaymentCaptureSettings,
  readPaymentCaptureSettings,
} from "../../../lib/order-finance/capture-settings";
import { updatePaymentCaptureSettingsWorkflow } from "../../../workflows/update-payment-capture-settings";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<PaymentCaptureSettingsResponse>,
) {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(
    publicPaymentCaptureSettings(await readPaymentCaptureSettings(req.scope)),
  );
}

export async function POST(
  req: AuthenticatedMedusaRequest<UpdatePaymentCaptureSettings>,
  res: MedusaResponse<PaymentCaptureSettingsResponse>,
) {
  const { result } = await updatePaymentCaptureSettingsWorkflow(req.scope).run({
    input: { ...req.validatedBody, actor_id: req.auth_context.actor_id },
  });
  res.json(result);
}
