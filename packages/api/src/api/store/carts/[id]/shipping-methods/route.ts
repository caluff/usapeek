import { POST as addShippingMethods } from "@mercurjs/core/api/store/carts/[id]/shipping-methods/route";
import { withStoreCartOwnership } from "../../../cart-ownership/route-guard";

export async function POST(req: Parameters<typeof addShippingMethods>[0], res: Parameters<typeof addShippingMethods>[1]) {
  return withStoreCartOwnership(req, res, addShippingMethods);
}
