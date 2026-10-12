import type { AccountEmailVerificationResponse } from "@usapeek/api/auth-contracts";
import { authorizeVendor } from "@/features/workspace/data";
import { getVendorVerificationCode } from "@/lib/auth-sdk";
import { EmailVerificationForm } from "./email-verification-form";

export async function EmailVerification() {
  const { sdk } = await authorizeVendor();
  const [verification, code] = await Promise.all([
    sdk.client
      .fetch<AccountEmailVerificationResponse>(
        "/auth/account/email-verification",
        { cache: "no-store" },
      )
      .catch(() => null),
    getVendorVerificationCode(),
  ]);
  if (!verification)
    return (
      <p role="alert" className="text-sm text-destructive">
        No pudimos consultar la verificación del correo. Recarga la página para
        intentarlo de nuevo.
      </p>
    );
  return (
    <EmailVerificationForm
      verification={verification}
      hasCode={Boolean(code)}
    />
  );
}
