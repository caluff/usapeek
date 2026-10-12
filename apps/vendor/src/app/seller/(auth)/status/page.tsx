import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutVendorAction } from "@/app/seller/auth-actions";
import { Button } from "@/components/ui/button";
import { VendorAuthShell } from "@/components/vendor/vendor-auth-shell";
import { getVendorContext } from "@/lib/auth-sdk";

export const metadata: Metadata = {
  title: "Estado de la tienda",
  description: "Revisa el estado de acceso de tu tienda y las opciones disponibles en USAPEEK.",
};
const descriptions: Record<string, { title: string; description: string }> = {
  pending_approval: {
    title: "Tienda pendiente de aprobación",
    description:
      "El operador está revisando tu tienda. Podrás ingresar al espacio de trabajo cuando sea aprobada.",
  },
  suspended: {
    title: "Tienda suspendida",
    description:
      "El acceso a la operación está suspendido. Contacta al operador para revisar el estado de la tienda.",
  },
  terminated: {
    title: "Tienda finalizada",
    description:
      "Esta tienda ya no tiene acceso al espacio de trabajo. Contacta al operador si necesitas información.",
  },
};
export default async function SellerStatusPage() {
  const context = await getVendorContext();
  if (context.status === "authenticated") redirect("/seller");
  if (context.status === "unauthenticated") redirect("/seller/login");
  if (context.status !== "seller_unavailable") redirect("/seller/no-access");
  const content = descriptions[context.sellerStatus] ?? {
    title: "Tienda no disponible",
    description:
      "El estado actual de la tienda no permite ingresar al espacio de trabajo.",
  };
  return (
    <VendorAuthShell title={content.title} description={content.description}>
      <div className="space-y-4">
        <p className="text-sm font-semibold">{context.sellerName}</p>
        {context.reason ? (
          <p className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm leading-6">
            {context.reason}
          </p>
        ) : null}
        <Button asChild variant="outline" className="h-11 w-full">
          <Link href="/seller/select-seller">Elegir otra tienda</Link>
        </Button>
        <form action={logoutVendorAction}>
          <Button type="submit" variant="ghost" className="h-11 w-full">
            Cerrar sesión
          </Button>
        </form>
      </div>
    </VendorAuthShell>
  );
}
