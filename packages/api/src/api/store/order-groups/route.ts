import { GET as listOrderGroups } from "@mercurjs/core/api/store/order-groups/route";
import { assertStoreOrderProjection } from "../cart-ownership/order-projection";

export async function GET(req: Parameters<typeof listOrderGroups>[0], res: Parameters<typeof listOrderGroups>[1]) {
  assertStoreOrderProjection(req.queryConfig.fields, "order_group");
  return listOrderGroups(req, res);
}
