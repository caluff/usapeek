import { LogOut, ShieldX } from "lucide-react";
import type { Metadata } from "next";
import { logoutVendorAction } from "@/app/seller/auth-actions";
import { Button } from "@/components/ui/button";
import { VendorAuthShell } from "@/components/vendor/vendor-auth-shell";
import { sellerApplicationUrl } from "@/lib/storefront-url";

export const metadata: Metadata = {
  title: "Sin tienda disponible",
  description: "Consulta las opciones de acceso cuando tu cuenta no tiene una tienda activa en USAPEEK.",
};
export default function NoVendorAccessPage() {
  const applicationUrl = sellerApplicationUrl();
  return (
    <VendorAuthShell
      title="Sin tienda disponible"
      description="Esta cuenta no tiene acceso a una tienda activa."
    >
      <div className="space-y-5">
        <div className="rounded-lg border border-warning/55 bg-warning/10 p-4 text-sm leading-6">
          <ShieldX className="mb-3 size-5" aria-hidden="true" />
          Tu solicitud puede estar pendiente, tu membresía puede haber cambiado
          o tu tienda puede haber finalizado. Consulta el estado de tu solicitud
          desde tu cuenta de comprador o contacta al operador.
        </div>
        {applicationUrl ? (
          <Button asChild variant="outline" className="h-11 w-full">
            <a href={applicationUrl}>Consultar o solicitar mi tienda</a>
          </Button>
        ) : null}
        <form action={logoutVendorAction}>
          <Button type="submit" variant="outline" className="h-11 w-full">
            <LogOut aria-hidden="true" />
            Cerrar sesión
          </Button>
        </form>
      </div>
    </VendorAuthShell>
  );
}
