import { GET as retrieveOrder } from "@mercurjs/core/api/store/orders/[id]/route";
import { assertStoreOrderProjection } from "../../cart-ownership/order-projection";

export async function GET(req: Parameters<typeof retrieveOrder>[0], res: Parameters<typeof retrieveOrder>[1]) {
  assertStoreOrderProjection(req.queryConfig.fields, "order");
  return retrieveOrder(req, res);
}
