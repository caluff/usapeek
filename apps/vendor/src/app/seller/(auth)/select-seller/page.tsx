import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { logoutVendorAction } from "@/app/seller/auth-actions";
import { Button } from "@/components/ui/button";
import { VendorSellerSelectionForm } from "@/components/vendor/vendor-auth-forms";
import { VendorAuthShell } from "@/components/vendor/vendor-auth-shell";
import { getVendorToken, listVendorMemberships } from "@/lib/auth-sdk";
import { safeRedirectPath } from "@/lib/auth-utils";

export const metadata: Metadata = {
  title: "Elegir tienda",
  description: "Selecciona la tienda que quieres gestionar con tu cuenta de vendedor de USAPEEK.",
};
export default async function SelectSellerPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const token = await getVendorToken();
  const next = safeRedirectPath((await searchParams).next, "/seller");
  if (!token) redirect(`/seller/login?next=${encodeURIComponent(next)}`);
  let memberships;
  try {
    memberships = (await listVendorMemberships(token)).filter((entry) => entry.member?.is_active);
  } catch {
    redirect(`/seller/login?reason=expired&next=${encodeURIComponent(next)}`);
  }
  if (!memberships.length) redirect("/seller/no-access");
  return <VendorAuthShell title={memberships.length === 1 ? "Preparando tu tienda" : "Elige una tienda"} description={memberships.length === 1 ? "Validamos el contexto de tu tienda antes de entrar." : "Tu identidad pertenece a varias tiendas. Cada espacio mantiene sus datos aislados."}><VendorSellerSelectionForm memberships={memberships} next={next} />{memberships.length > 1 ? <form action={logoutVendorAction} className="mt-4"><Button type="submit" variant="ghost" className="h-11 w-full"><LogOut aria-hidden="true" /> Cerrar sesión</Button></form> : null}</VendorAuthShell>;
}
