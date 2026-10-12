import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { VendorLoginForm } from "@/components/vendor/vendor-auth-forms";
import { VendorAuthShell } from "@/components/vendor/vendor-auth-shell";
import { getVendorContext, getVendorToken } from "@/lib/auth-sdk";
import { GoogleLoginForm } from "@/components/vendor/google-login-form";
import { googleFeedback } from "@/lib/google-auth";
import { getVendorMfa } from "@/lib/auth-sdk";
import { safeRedirectPath } from "@/lib/auth-utils";
import { sellerApplicationUrl } from "@/lib/storefront-url";

export const metadata: Metadata = {
  title: "Acceso de vendedor",
  description: "Inicia sesión con tu cuenta autorizada para gestionar tu tienda en USAPEEK.",
};

export default async function SellerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string; google?: string }>;
}) {
  const params = await searchParams;
  const mfa = params.google === "mfa" ? await getVendorMfa() : null;
  const googleMessage = googleFeedback(params.google);
  const next = safeRedirectPath(params.next, "/seller");
  const context = await getVendorContext();
  if (!mfa && context.status === "seller_unavailable") redirect("/seller/status");
  if (!mfa && context.status === "authenticated") redirect(next);
  if (!mfa && context.status === "seller_missing" && (await getVendorToken()))
    redirect(`/seller/select-seller?next=${encodeURIComponent(next)}`);
  const applicationUrl = sellerApplicationUrl();
  return (
    <VendorAuthShell
      title="Acceso de vendedor"
      description="Ingresa con una cuenta autorizada para operar tu tienda."
    >
      {googleMessage ? <p role="status" className="mb-4 text-sm">{googleMessage}</p> : null}
      <VendorLoginForm next={next} expired={params.reason === "expired"} mfaMethods={mfa?.methods} />
      {!mfa ? <GoogleLoginForm next={next} /> : null}
      {applicationUrl ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          ¿Quieres vender?{" "}
          <a
            href={applicationUrl}
            className="font-semibold text-primary underline"
          >
            Solicita tu tienda desde tu cuenta
          </a>
        </p>
      ) : null}
    </VendorAuthShell>
  );
}
