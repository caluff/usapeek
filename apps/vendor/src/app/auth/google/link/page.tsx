import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GoogleLoginForm } from "@/components/vendor/google-login-form";
import { VendorAuthShell } from "@/components/vendor/vendor-auth-shell";
import { getVendorToken, listVendorMemberships } from "@/lib/auth-sdk";
import { safeRedirectPath } from "@/lib/auth-utils";

export const metadata: Metadata = {
  title: "Vincular Google",
  description:
    "Conecta tu cuenta de Google con tu cuenta de vendedor de USAPEEK.",
};

export default async function LinkGooglePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeRedirectPath((await searchParams).next, "/seller");
  const token = await getVendorToken();
  if (!token) redirect(`/seller/login?next=${encodeURIComponent(`/auth/google/link?next=${encodeURIComponent(next)}`)}`);
  const memberships = await listVendorMemberships(token);
  const membership = memberships.find((entry) => entry.member?.is_active);
  if (!membership) redirect("/seller/no-access");
  return (
    <VendorAuthShell title="Vincular Google" description={`Conectarás Google con tu cuenta de vendedor ${membership.member.email}. Selecciona la cuenta de Google que tenga el mismo correo.`}>
      <GoogleLoginForm next={next} link />
      <Link href={next} className="mt-4 flex min-h-11 items-center justify-center text-sm underline">Cancelar</Link>
    </VendorAuthShell>
  );
}
