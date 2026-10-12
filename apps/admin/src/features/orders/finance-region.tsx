import type { OrderFinanceResponse } from "@usapeek/api/finance-contracts";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdminSdk } from "@/lib/auth-sdk";
import { isOrderId } from "./helpers";
import { OrderFinancePanel } from "./finance-panel";
import { retrieveOrder } from "./data";

export function OrderFinanceSkeleton() {
  return (
    <section className="space-y-5" aria-label="Finanzas" aria-busy="true">
      <h2 className="text-lg font-semibold text-[color-mix(in_oklch,var(--brand-accent)_30%,var(--foreground))]">
        Finanzas
      </h2>
      <div aria-label="Cargando información financiera">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex min-h-16 items-center gap-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="ml-auto h-4 w-24" />
            <Skeleton className="size-11" />
          </div>
        ))}
      </div>
    </section>
  );
}

export async function OrderFinanceRegion({ id }: { id: string }) {
  const sdk = await requireAdminSdk();
  if (!isOrderId(id)) return null;
  let data: OrderFinanceResponse;
  let isCanceled: boolean;
  try {
    const [order, response] = await Promise.all([
      retrieveOrder(sdk, id),
      sdk.client.fetch<OrderFinanceResponse>(`/admin/orders/${id}/finance`, {
        cache: "no-store",
      }),
    ]);
    data = response;
    isCanceled = order.status === "canceled";
  } catch {
    return (
      <section className="space-y-5" aria-label="Finanzas">
        <h2 className="text-lg font-semibold text-[color-mix(in_oklch,var(--brand-accent)_30%,var(--foreground))]">
          Finanzas
        </h2>
        <p role="alert" className="text-sm text-muted-foreground">
          No se pudo cargar la información financiera. Actualiza la página para
          volver a intentarlo.
        </p>
      </section>
    );
  }
  return <OrderFinancePanel data={data} isCanceled={isCanceled} />;
}
