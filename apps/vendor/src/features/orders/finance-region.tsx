import type { OrderFinanceResponse } from "@usapeek/api/finance-contracts";
import type { OrderDetailDTO } from "@medusajs/types";
import { Skeleton } from "@/components/ui/skeleton";
import { workspace } from "../workspace/data";
import { resourceId } from "../workspace/validation";
import { OrderFinancePanel } from "./finance-panel";
import { readOrderDetail } from "./detail-read";

export function OrderFinanceSkeleton() {
  return (
    <section className="space-y-5" aria-label="Finanzas">
      <h2 className="text-lg font-semibold text-[color-mix(in_oklch,var(--brand-accent)_30%,var(--foreground))]">
        Finanzas
      </h2>
      <Skeleton
        className="h-64 w-full"
        aria-label="Cargando información financiera"
      />
    </section>
  );
}

export async function OrderFinanceRegion({ id }: { id: string }) {
  const { client } = await workspace();
  resourceId(id);
  let data: OrderFinanceResponse;
  let orderStatus: OrderDetailDTO["status"];
  try {
    const [finance, detail] = await Promise.all([
      client.get<OrderFinanceResponse>(`/vendor/orders/${id}/finance`),
      readOrderDetail(id),
    ]);
    data = finance;
    orderStatus = detail.order.status;
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
  return <OrderFinancePanel data={data} orderStatus={orderStatus} />;
}
