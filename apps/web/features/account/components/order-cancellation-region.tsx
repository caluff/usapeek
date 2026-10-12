import type { StoreOrderCancellationResponse } from "@usapeek/api/finance-contracts";
import { getAccount } from "../data";
import { OrderCancellation } from "./order-cancellation";

export async function OrderCancellationRegion({
  orderId,
}: {
  orderId: string;
}) {
  const { sdk } = await getAccount();
  let data: StoreOrderCancellationResponse;
  try {
    data = await sdk.client.fetch<StoreOrderCancellationResponse>(
      `/store/orders/${orderId}/cancellation`,
      { cache: "no-store" },
    );
  } catch {
    return (
      <p role="alert" className="max-w-64 text-sm text-muted-foreground">
        No se pudo consultar la cancelación. Actualiza el pedido para volver a
        intentarlo.
      </p>
    );
  }
  return <OrderCancellation orderId={orderId} cancellation={data.cancellation} />;
}
