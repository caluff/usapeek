import { createHash } from "node:crypto";
import type { AuthContext } from "@medusajs/framework/http";
import type { IAuthModuleService } from "@medusajs/framework/types";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { getAccountEmailVerification } from "../../lib/account-email-verification";
import { getAuthEmailConfiguration } from "../../lib/auth-email";
import { getResendConfiguration } from "../../modules/resend/configuration";

export const prepareAccountEmailVerificationStep = createStep("prepare-account-email-verification", async (context: AuthContext, { container }) => {
  const account = await getAccountEmailVerification(container, context);
  if (account.status === "verified") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This email is already verified.");
  if (!getAuthEmailConfiguration().enabled || !getResendConfiguration()) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Email verification delivery is unavailable.");
  return new StepResponse({ auth_identity_id: context.auth_identity_id, entity_id: account.email, entity_type: "email", code_provider: "token", metadata: { actor_type: context.actor_type } });
});

export const confirmAccountEmailVerificationStep = createStep("confirm-account-email-verification", async (input: { auth_context: AuthContext; code: string }, { container }) => {
  const account = await getAccountEmailVerification(container, input.auth_context);
  const auth = container.resolve<IAuthModuleService>(Modules.AUTH);
  // Medusa 2.18's token provider searches globally; scope its SHA-256 token proof
  // to this identity and current email before allowing the native confirmation.
  const records = await auth.listAuthVerifications({
    auth_identity_id: input.auth_context.auth_identity_id,
    entity_id: account.email,
    entity_type: "email",
    code_provider: "token",
  });
  const tokenHash = createHash("sha256").update(input.code).digest("hex");
  if (!records.some(record => record.provider_metadata?.token_hash === tokenHash)) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Verification code does not belong to this account.");
  await auth.confirmAuthVerification({ auth_identity_id: input.auth_context.auth_identity_id, code: input.code, code_provider: "token" });
  return new StepResponse(await getAccountEmailVerification(container, input.auth_context));
});
