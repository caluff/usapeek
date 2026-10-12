import { GET as listOrders } from "@mercurjs/core/api/store/orders/route";
import { assertStoreOrderProjection } from "../cart-ownership/order-projection";

export async function GET(req: Parameters<typeof listOrders>[0], res: Parameters<typeof listOrders>[1]) {
  assertStoreOrderProjection(req.queryConfig.fields, "order");
  return listOrders(req, res);
}
