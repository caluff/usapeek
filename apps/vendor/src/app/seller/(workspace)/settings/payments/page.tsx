import type { Metadata } from "next";
import { Suspense } from "react";
import { FeedbackToast } from "@/components/feedback-toast";
import { StripeAccountRefresh } from "@/features/stripe-connect/account-refresh";
import {
  StripeAccountCard,
  StripeAccountSkeleton,
} from "@/features/stripe-connect/account-card";

export const metadata: Metadata = {
  title: "Configuración de cobros",
  description: "Revisa la configuración de Stripe Connect de tu tienda en el entorno de pruebas de USAPEEK.",
};

async function ReturnNotice({
  searchParams,
}: {
  searchParams: Promise<{ returned?: string; refresh?: string }>;
}) {
  const params = await searchParams;
  return (
    <>
      {params.refresh === "1" ? (
        <FeedbackToast
          feedback={{
            status: "warning",
            message:
              "El enlace de Stripe venció. Pulsa revisar configuración para abrir uno nuevo.",
          }}
        />
      ) : null}
      <StripeAccountRefresh returned={params.returned === "1"} />
    </>
  );
}

export default function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ returned?: string; refresh?: string }>;
}) {
  return (
    <div className="max-w-4xl space-y-6">
      <p className="text-sm text-muted-foreground">
        Entorno de pruebas · Estados Unidos · USD. Esta configuración no
        habilita ventas reales.
      </p>
      <Suspense fallback={null}>
        <ReturnNotice searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<StripeAccountSkeleton />}>
        <StripeAccountCard />
      </Suspense>
    </div>
  );
}
