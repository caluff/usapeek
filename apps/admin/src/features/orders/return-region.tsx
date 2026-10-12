import type { HttpTypes } from "@medusajs/types";
import type { ComponentProps } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdminSdk } from "@/lib/auth-sdk";
import { isOrderId } from "./helpers";
import { retrieveOrder } from "./data";
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
  if (!isOrderId(id)) return null;
  const sdk = await requireAdminSdk();
  let props: ComponentProps<typeof OrderReturnsPanel>;
  try {
    const order = await retrieveOrder(sdk, id);
    if (order.status === "canceled") return null;
    const [returns, changes] = await Promise.all([
      sdk.admin.return.list({
        order_id: id,
        fields: RETURN_FIELDS,
        limit: 100,
        order: "-created_at",
      }),
      sdk.admin.order.listChanges(id, { fields: RETURN_CHANGE_FIELDS }),
    ]);
    const locations = order.seller?.id
      ? await sdk.client
          .fetch<HttpTypes.AdminStockLocationListResponse>(
            "/admin/stock-locations",
            {
              query: {
                seller_id: order.seller.id,
                fields: "id,name",
                limit: 100,
              },
              cache: "no-store",
            },
          )
          .catch(() => null)
      : null;
    props = {
      orderId: id,
      items: order.items ?? [],
      records: returns.returns.map(returnPanelRecord),
      changes: changes.order_changes,
      locations: locations?.stock_locations ?? [],
      isCanceled: false,
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
