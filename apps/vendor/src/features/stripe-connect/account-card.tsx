import type { HttpTypes, PayoutAccountStatus } from "@mercurjs/types";
import { CreditCard, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataError } from "@/features/workspace/components";
import { resultOf, workspace } from "@/features/workspace/data";
import { StripeOnboardingButton } from "./onboarding-button";

const statuses = {
  pending: {
    label: "Configuración pendiente",
    variant: "warning",
    description:
      "Completa tus datos en Stripe para que pueda verificar tu cuenta.",
  },
  active: {
    label: "Cuenta habilitada",
    variant: "success",
    description:
      "Último estado confirmado: cuenta habilitada. Publicar productos y recibir pedidos requiere completar también el catálogo, inventario y envíos.",
  },
  restricted: {
    label: "Requiere atención",
    variant: "warning",
    description:
      "El último estado registrado requiere atención. Actualiza desde Stripe para comprobar si la verificación cambió, o continúa la configuración para consultar los requisitos.",
  },
  rejected: {
    label: "Cuenta rechazada",
    variant: "destructive",
    description:
      "Esta cuenta no está habilitada. Contacta al administrador para revisar la situación.",
  },
} as const satisfies Record<
  PayoutAccountStatus,
  {
    label: string;
    variant: "warning" | "success" | "destructive";
    description: string;
  }
>;

export function StripeAccountSkeleton() {
  return (
    <Card aria-label="Cargando cuenta de Stripe" aria-busy="true">
      <CardHeader>
        <CardTitle>Cuenta de cobros</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-10 w-56" />
      </CardContent>
    </Card>
  );
}

export async function StripeAccountCard() {
  const { client } = await workspace();
  const result = await resultOf(
    client.get<HttpTypes.VendorPayoutAccountListResponse>(
      "/vendor/payout-accounts",
      { limit: 2, fields: "id,status" },
    ),
  );
  if (!result.data) return <DataError message={result.error} />;
  if (result.data.count > 1 || result.data.payout_accounts.length > 1)
    return (
      <DataError message="Hay más de una cuenta de cobros vinculada. El administrador debe revisar la configuración." />
    );
  const account = result.data.payout_accounts[0];
  const status = account ? statuses[account.status] : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="size-5" aria-hidden="true" /> Cuenta de cobros
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <Badge variant={status?.variant ?? "warning"}>
          {status?.label ?? "Sin configurar"}
        </Badge>
        <p className="text-sm leading-6 text-muted-foreground">
          {status?.description ??
            "Conecta tu tienda con Stripe para verificar tu identidad y añadir la cuenta bancaria donde recibirás tus cobros."}
        </p>
        {account?.status !== "rejected" ? (
          <StripeOnboardingButton
            label={
              account
                ? "Revisar configuración en Stripe"
                : "Configurar Stripe Connect"
            }
          />
        ) : null}
        <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Tus documentos y datos bancarios se completan directamente en Stripe.
          Volver al portal no confirma por sí solo la verificación.
        </p>
      </CardContent>
    </Card>
  );
}
