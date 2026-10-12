import {
  OrderFilters,
  OrderListSkeleton,
} from "@/features/orders/list-components";
import { orderListInput } from "@/features/orders/parameters";

export default function OrdersLoading() {
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Pedidos de la tienda</h1>
      <OrderFilters input={orderListInput({})} />
      <OrderListSkeleton />
    </div>
  );
}
