import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorVerifyForm } from "@/components/vendor/vendor-auth-forms";
import { VendorAuthShell } from "@/components/vendor/vendor-auth-shell";
import { getVendorVerificationCode, getVendorContext } from "@/lib/auth-sdk";
import { safeRedirectPath } from "@/lib/auth-utils";

export const metadata: Metadata = {
  title: "Verificar correo",
  description: "Confirma tu correo electrónico para completar la verificación de tu cuenta de vendedor.",
  robots: { index: false, follow: false },
};
export default async function VerifyVendorEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if ((await getVendorContext()).status === "authenticated")
    redirect("/seller/account");
  const next = safeRedirectPath((await searchParams).next, "/seller");
  return (
    <VendorAuthShell
      title="Verificar correo"
      description="Confirma el código asociado a tu identidad de miembro."
    >
      <VendorVerifyForm
        hasCode={Boolean(await getVendorVerificationCode())}
        next={next}
      />
    </VendorAuthShell>
  );
}
