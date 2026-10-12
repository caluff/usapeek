import { POST as addLineItem } from "@mercurjs/core/api/store/carts/[id]/line-items/route";
import { withStoreCartOwnership } from "../../../cart-ownership/route-guard";

export async function POST(req: Parameters<typeof addLineItem>[0], res: Parameters<typeof addLineItem>[1]) {
  return withStoreCartOwnership(req, res, addLineItem);
}
