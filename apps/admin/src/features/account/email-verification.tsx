import type { AccountEmailVerificationResponse } from "@usapeek/api/auth-contracts";
import { requireAdminSdk, getAdminVerificationCode } from "@/lib/auth-sdk";
import { EmailVerificationForm } from "./email-verification-form";

export async function EmailVerification() {
  const sdk = await requireAdminSdk();
  const [verification, code] = await Promise.all([
    sdk.client
      .fetch<AccountEmailVerificationResponse>(
        "/auth/account/email-verification",
        { cache: "no-store" },
      )
      .catch(() => null),
    getAdminVerificationCode(),
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
