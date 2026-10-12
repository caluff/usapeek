import type { HttpTypes } from "@mercurjs/types";
import type { ComponentProps } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { sellerWarehouse } from "../inventory/data";
import { workspace } from "../workspace/data";
import { resourceId } from "../workspace/validation";
import { readOrderDetail } from "./detail-read";
import { OrderReturnsPanel } from "./return-panel";
import {
  RETURN_FIELDS,
  RETURN_CHANGE_FIELDS,
  returnPanelRecord,
} from "./return-operations";

export function OrderReturnsSkeleton() {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-[color-mix(in_oklch,var(--brand-accent)_30%,var(--foreground))]">
        Devoluciones
      </h2>
      <Skeleton className="h-24 w-full" aria-label="Cargando devoluciones" />
    </section>
  );
}

export async function OrderReturnsRegion({ id }: { id: string }) {
  resourceId(id);
  const { client } = await workspace();
  let props: ComponentProps<typeof OrderReturnsPanel>;
  try {
    const [detail, returns, changes, warehouse] = await Promise.all([
      readOrderDetail(id),
      client.get<HttpTypes.VendorReturnListResponse>("/vendor/returns", {
        order_id: id,
        fields: RETURN_FIELDS,
        limit: 100,
        order: "-created_at",
      }),
      client.get<HttpTypes.VendorOrderChangesResponse>(
        `/vendor/orders/${id}/changes`,
        { fields: RETURN_CHANGE_FIELDS },
      ),
      sellerWarehouse(client).catch(() => null),
    ]);
    props = {
      orderId: id,
      items: detail.order.items ?? [],
      records: returns.returns.map(returnPanelRecord),
      changes: changes.order_changes,
      locations: warehouse?.status === "ready" ? [warehouse.location] : [],
      isCanceled: detail.order.status === "canceled",
    };
  } catch {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[color-mix(in_oklch,var(--brand-accent)_30%,var(--foreground))]">
          Devoluciones
        </h2>
        <p role="alert" className="text-sm text-muted-foreground">
          No se pudieron cargar las devoluciones. Actualiza el pedido para
          volver a intentarlo.
        </p>
      </section>
    );
  }
  return <OrderReturnsPanel {...props} />;
}
