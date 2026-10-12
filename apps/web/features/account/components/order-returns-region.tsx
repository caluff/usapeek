import type { CustomerReturnsResponse } from "@usapeek/api/finance-contracts";
import { getAccount } from "../data";
import { OrderReturns } from "./order-returns";

export async function OrderReturnsRegion({ orderId }: { orderId: string }) {
  const { sdk } = await getAccount();
  let data: CustomerReturnsResponse;
  try {
    data = await sdk.client.fetch<CustomerReturnsResponse>(
      `/store/orders/${orderId}/returns`,
      { cache: "no-store" },
    );
  } catch {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        No se pudieron consultar las devoluciones. Actualiza el pedido para
        volver a intentarlo.
      </p>
    );
  }
  return <OrderReturns orderId={orderId} data={data} />;
}
