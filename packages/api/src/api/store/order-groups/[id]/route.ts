import { GET as retrieveOrderGroup } from "@mercurjs/core/api/store/order-groups/[id]/route";
import { assertStoreOrderProjection } from "../../cart-ownership/order-projection";

export async function GET(req: Parameters<typeof retrieveOrderGroup>[0], res: Parameters<typeof retrieveOrderGroup>[1]) {
  assertStoreOrderProjection(req.queryConfig.fields, "order_group");
  return retrieveOrderGroup(req, res);
}
